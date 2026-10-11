import { Claim } from "../models/Claim.js";
import { AppError } from "../utils/AppError.js";
import { logger } from "../utils/logger.js";
import { CLAIM_TYPES, PRIORITIES, STATUSES, DOC_TYPES } from "../utils/constants.js";
import { canTransition } from "../services/claimWorkflow.js";
import { findClaimOrThrow, toClaimResponse } from "../services/claimService.js";
import { uploadToS3, getDownloadUrl } from "../services/documentService.js";
import { assessClaim } from "../ai/aiService.js";
import { broadcastStatusChange } from "../sockets/socketService.js";
import { config } from "../config/env.js";

const simulation = (req) => (config.allowFailureSim ? req.query.simulateFailure : undefined);

export async function listClaims(req, res) {
  const { claimType, status, priority, search } = req.query;
  const filter = {};
  if (claimType) {
    if (!CLAIM_TYPES.includes(claimType)) throw new AppError(400, "VALIDATION_ERROR", "Invalid claimType");
    filter.claimType = claimType;
  }
  if (status) {
    if (!STATUSES.includes(status)) throw new AppError(400, "VALIDATION_ERROR", "Invalid status");
    filter.status = status;
  }
  if (priority) {
    if (!PRIORITIES.includes(priority)) throw new AppError(400, "VALIDATION_ERROR", "Invalid priority");
    filter.priority = priority;
  }
  if (search) {
    const s = String(search).slice(0, 60).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    filter.$or = [{ claimNumber: new RegExp(s, "i") }, { customerName: new RegExp(s, "i") }];
  }
  const docs = await Claim.find(filter).select("-assessment -statusHistory").sort({ createdAt: -1 }).lean();
  const claims = docs.map(({ _id, __v, ...rest }) => ({ id: String(_id), ...rest }));
  res.json({ count: claims.length, claims });
}

export async function getClaim(req, res) {
  res.json(toClaimResponse(await findClaimOrThrow(req.params.id)));
}

export async function updateStatus(req, res) {
  const { status, note } = req.body || {};
  if (!STATUSES.includes(status)) throw new AppError(400, "VALIDATION_ERROR", `status must be one of: ${STATUSES.join(", ")}`);
  if (note !== undefined && (typeof note !== "string" || note.length > 500)) throw new AppError(400, "VALIDATION_ERROR", "note must be text up to 500 characters");

  const claim = await findClaimOrThrow(req.params.id);
  const from = claim.status;
  if (!canTransition(from, status))
    throw new AppError(400, "INVALID_TRANSITION", `Cannot change status from ${from} to ${status}`);

  claim.status = status;
  claim.statusHistory.push({ from, to: status, by: req.user.name, note });
  await claim.save(); // persisted BEFORE we notify anyone

  logger.info("claim_status_changed", { claimNumber: claim.claimNumber, from, to: status, userId: req.user.id });
  broadcastStatusChange({
    claimId: claim.id, claimNumber: claim.claimNumber, from, to: status,
    updatedBy: req.user.name, at: new Date().toISOString(),
  });
  res.json(toClaimResponse(claim));
}

export async function uploadDocument(req, res) {
  const claim = await findClaimOrThrow(req.params.id);
  if (!req.file) throw new AppError(400, "VALIDATION_ERROR", "A file is required (form field name: file)");
  const docType = req.body?.docType || "OTHER";
  if (!DOC_TYPES.includes(docType)) throw new AppError(400, "VALIDATION_ERROR", "Invalid docType");

  const { key, safeName } = await uploadToS3({ claimNumber: claim.claimNumber, file: req.file, simulate: simulation(req) });
  claim.supportingDocuments.push({
    originalName: safeName, docType, s3Key: key, mimeType: req.file.mimetype,
    size: req.file.size, uploadedBy: req.user.name,
  });
  await claim.save();
  logger.info("document_uploaded", { claimNumber: claim.claimNumber, docType });
  res.status(201).json(toClaimResponse(claim));
}

export async function getDocumentUrl(req, res) {
  const claim = await findClaimOrThrow(req.params.id);
  const doc = claim.supportingDocuments.id(req.params.docId);
  if (!doc) throw new AppError(404, "DOCUMENT_NOT_FOUND", "Document not found");
  if (!doc.s3Key) throw new AppError(404, "DOCUMENT_NOT_STORED", "This is a seeded demo record with no stored file");
  res.json({ url: await getDownloadUrl(doc.s3Key) });
}

export async function generateAssessment(req, res) {
  const claim = await findClaimOrThrow(req.params.id);
  const assessment = await assessClaim(claim, { simulate: simulation(req) });
  claim.assessment = assessment;
  claim.assessmentSummary = `[${assessment.recommendation}] ${assessment.summary}`;
  claim.assessmentGeneratedAt = new Date();
  claim.markModified("assessment");
  await claim.save();
  logger.info("assessment_generated", { claimNumber: claim.claimNumber, recommendation: assessment.recommendation, provider: assessment.model.provider });
  res.json({ assessment, claim: claim.toJSON() });
}
