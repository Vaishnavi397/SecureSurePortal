import { search } from "../ai/ragService.js";
import { AppError } from "../utils/AppError.js";
import { CLAIM_TYPES } from "../utils/constants.js";
import { logger } from "../utils/logger.js";

export async function searchPolicies(req, res) {
  const q = String(req.query.q || "").trim();
  const { claimType } = req.query;
  if (q.length < 2 || q.length > 300) throw new AppError(400, "VALIDATION_ERROR", "q must be 2-300 characters");
  if (claimType && !CLAIM_TYPES.includes(claimType)) throw new AppError(400, "VALIDATION_ERROR", "Invalid claimType");
  try {
    const results = await search(q, { claimType, k: 5, fetchK: 12 });
    res.json({ query: q, count: results.length, results });
  } catch (err) {
    logger.error("rag_search_failed", { err: err.message });
    throw new AppError(503, "RAG_FAILURE", "Policy search is temporarily unavailable");
  }
}
