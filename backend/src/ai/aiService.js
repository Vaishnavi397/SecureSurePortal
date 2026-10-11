import { runAssessmentGraph } from "./assessmentGraph.js";
import { llmInfo } from "./llm.js";
import { AppError } from "../utils/AppError.js";
import { logger } from "../utils/logger.js";

// Public entry point used by the controller. Always throws a controlled AppError on failure.
export async function assessClaim(claimDoc, { simulate } = {}) {
  const claim = {
    claimNumber: claimDoc.claimNumber,
    claimType: claimDoc.claimType,
    priority: claimDoc.priority,
    incidentDate: claimDoc.incidentDate,
    incidentDescription: claimDoc.incidentDescription,
    claimedAmount: claimDoc.claimedAmount,
    // customerName / policyNumber are intentionally NOT sent to the LLM (data minimisation)
    supportingDocuments: claimDoc.supportingDocuments.map((d) => ({ docType: d.docType, originalName: d.originalName })),
  };

  let result;
  try {
    result = await runAssessmentGraph({ claim, simulate });
  } catch (err) {
    logger.error("assessment_graph_crashed", { err: err.message });
    throw new AppError(500, "ASSESSMENT_FAILED", "Assessment failed unexpectedly. Please try again.");
  }
  if (result.error) throw new AppError(result.error.status, result.error.code, result.error.message);

  return {
    ...result.assessment,
    advisoryOnly: true,
    model: llmInfo(),
    generatedAt: new Date().toISOString(),
    retrievedChunks: result.chunks.map((c) => ({ clauseId: c.clauseId, source: c.source, score: c.score })),
    workflow: result.trace,
  };
}
