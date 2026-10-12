// LangGraph workflow for AI claim assessment.
//
//  START -> buildQuery -> retrievePolicy -+-(good context)--------------> generateAssessment
//                                         +-(weak/empty, round<2)-> retrieveMore -+
//                                         +-(error)---------------> END
//  generateAssessment -> validateAssessment -+-(valid)-> END
//                                            +-(invalid, attempts<2)-> generateAssessment
import { StateGraph, Annotation, START, END } from "@langchain/langgraph";
import { z } from "zod";
import { search } from "./ragService.js";
import { buildPrompt } from "./prompts.js";
import { callLLM } from "./llm.js";
import { parseAssessmentText } from "./parseAssessment.js";
import { logger } from "../utils/logger.js";

const MIN_TOP_SCORE = 0.05;
const MAX_RETRIEVAL_ROUNDS = 2;
const MAX_ATTEMPTS = 2;

const State = Annotation.Root({
  claim: Annotation(),
  simulate: Annotation(),
  query: Annotation(),
  queries: Annotation(),
  chunks: Annotation(),
  topScore: Annotation(),
  retrievalRounds: Annotation(),
  attempts: Annotation(),
  assessment: Annotation(),
  validationErrors: Annotation(),
  error: Annotation(),
  trace: Annotation({ reducer: (a, b) => a.concat(b), default: () => [] }),
});

const fail = (code, status, message) => ({ code, status, message });

const AssessmentSchema = z.object({
  recommendation: z.enum(["LIKELY_COVERED", "LIKELY_NOT_COVERED", "NEEDS_MORE_INFORMATION", "NEEDS_MANUAL_REVIEW"]),
  summary: z.string().min(10).max(1200),
  reasoning: z.string().min(5).max(2000),
  confidence: z.coerce.number().min(0).max(1),
  policyReferences: z.array(z.object({ clauseId: z.string(), relevance: z.string() })).min(1),
  missingInformation: z.array(z.string()),
  recommendedAction: z.string().min(5).max(800),
});

// ---- nodes ----
async function buildQuery(state) {
  const c = state.claim;
  // Several focused policy queries (coverage / exclusions / documents+limits) so the key
  // clause types are all retrieved, not only the ones most similar to the incident text.
  const queries = [
    `${c.claimType} insurance claim: ${c.incidentDescription} Coverage, exclusions, required documents, maximum payable claim limit and processing rules for a ${c.claimType} claim of amount ${c.claimedAmount}.`,
    `${c.claimType} exclusions: situations that are excluded and not covered. Incident: ${c.incidentDescription}`,
    `${c.claimType} required documents and maximum payable claim limit`,
  ];
  return { query: queries[0], queries, retrievalRounds: 0, attempts: 0, validationErrors: [], trace: ["buildQuery"] };
}

async function retrievePolicy(state) {
  try {
    if (state.simulate === "rag") throw new Error("Simulated retrieval failure");
    const merged = new Map();
    for (const q of state.queries) {
      const found = await search(q, { claimType: state.claim.claimType, k: 3, fetchK: 10 });
      for (const c of found) if (!merged.has(c.chunkId) || merged.get(c.chunkId).score < c.score) merged.set(c.chunkId, c);
    }
    const chunks = [...merged.values()].sort((a, b) => b.score - a.score);
    return { chunks, topScore: Math.max(0, ...chunks.map((c) => c.score)), retrievalRounds: 1, trace: ["retrievePolicy"] };
  } catch (err) {
    logger.error("rag_failure", { err: err.message });
    return { error: fail("RAG_FAILURE", 503, "Policy retrieval is temporarily unavailable. Please try again."), trace: ["retrievePolicy:error"] };
  }
}

async function retrieveMore(state) {
  try {
    const broader = `${state.claim.claimType} policy coverage exclusions required documents claim limit processing rules`;
    const more = await search(broader, { claimType: state.claim.claimType, k: 6, fetchK: 20 });
    const merged = [...new Map([...(state.chunks || []), ...more].map((c) => [c.chunkId, c])).values()];
    if (!merged.length) return { error: fail("RAG_NO_CONTEXT", 422, "No relevant policy information was found for this claim."), trace: ["retrieveMore:empty"] };
    return { chunks: merged, topScore: Math.max(0, ...merged.map((c) => c.score)), retrievalRounds: state.retrievalRounds + 1, trace: ["retrieveMore"] };
  } catch (err) {
    logger.error("rag_failure", { err: err.message });
    return { error: fail("RAG_FAILURE", 503, "Policy retrieval is temporarily unavailable. Please try again."), trace: ["retrieveMore:error"] };
  }
}

async function generateAssessment(state) {
  const attempts = state.attempts + 1;
  try {
    if (state.simulate === "llm") throw Object.assign(new Error("Simulated LLM failure"), { code: "SIMULATED" });
    const prompt = buildPrompt(state.claim, state.chunks, state.validationErrors);
    const text = await callLLM({ prompt, claim: state.claim, chunks: state.chunks });
    const parsed = parseAssessmentText(text); // tolerant of <think>, fences, snake_case, "82%", string refs
    if (!parsed) logger.warn("assessment_unparseable_output", { chars: text.length, preview: text.slice(0, 500) });
    return { assessment: parsed, attempts, trace: [`generateAssessment#${attempts}`] };
  } catch (err) {
    logger.error("ai_failure", { errName: err.name, code: err.code, status: err.status, err: String(err.message).slice(0, 200) });
    let e = fail("AI_FAILURE", 502, "The AI service failed to generate an assessment. Please try again later.");
    if (err.code === "AI_TIMEOUT") e = fail("AI_TIMEOUT", 504, "The AI service timed out. Please try again.");
    else if (err.status === 429 || /rate limit/i.test(err.message)) e = fail("AI_RATE_LIMITED", 429, "The AI service is rate limited. Please wait a moment and retry.");     else if (err.status === 402) e = fail("AI_QUOTA_EXCEEDED", 502, "The AI provider has no remaining credits. Check the provider account or switch the model.");
    return { error: e, attempts, trace: ["generateAssessment:error"] };
  }
}

async function validateAssessment(state) {
  const allowed = new Set(state.chunks.map((c) => c.clauseId));
  const parsed = AssessmentSchema.safeParse(state.assessment);
  const issues = [];
  if (!parsed.success) issues.push(...parsed.error.issues.map((i) => `${i.path.join(".") || "response"}: ${i.message}`));
  else {
    const unknown = parsed.data.policyReferences.filter((r) => !allowed.has(r.clauseId)).map((r) => r.clauseId);
    if (unknown.length) issues.push(`Cited clause IDs not present in the policy context: ${unknown.join(", ")}`);
  }
  if (issues.length) {
  logger.warn("assessment_validation_failed", {
    attempts: state.attempts,
    issues,
    response: state.assessment
  });
}

  if (!issues.length) return { assessment: parsed.data, validationErrors: [], trace: ["validateAssessment:ok"] };

  if (state.attempts < MAX_ATTEMPTS) return { validationErrors: issues, trace: ["validateAssessment:retry"] };

  // Final attempt: keep only grounded references; refuse if nothing grounded remains.
  if (parsed.success) {
    const grounded = parsed.data.policyReferences.filter((r) => allowed.has(r.clauseId));
    if (grounded.length) return { assessment: { ...parsed.data, policyReferences: grounded }, validationErrors: [], trace: ["validateAssessment:filtered"] };
    return { error: fail("AI_UNGROUNDED", 502, "The AI answer was not grounded in policy text and was discarded."), trace: ["validateAssessment:ungrounded"] };
  }
  return { error: fail("AI_FAILURE", 502, "The AI answer could not be validated. Please try again."), trace: ["validateAssessment:invalid"] };
}

// ---- routing ----
function routeAfterRetrieve(state) {
  if (state.error) return "end";
  const good = state.chunks?.length > 0 && state.topScore >= MIN_TOP_SCORE;
  if (good) return "generate";
  if (state.retrievalRounds < MAX_RETRIEVAL_ROUNDS) return "retry";
  return state.chunks?.length ? "generate" : "end";
}

const graph = new StateGraph(State)
  .addNode("buildQuery", buildQuery)
  .addNode("retrievePolicy", retrievePolicy)
  .addNode("retrieveMore", retrieveMore)
  .addNode("generateAssessment", generateAssessment)
  .addNode("validateAssessment", validateAssessment)
  .addEdge(START, "buildQuery")
  .addEdge("buildQuery", "retrievePolicy")
  .addConditionalEdges("retrievePolicy", routeAfterRetrieve, { generate: "generateAssessment", retry: "retrieveMore", end: END })
  .addConditionalEdges("retrieveMore", routeAfterRetrieve, { generate: "generateAssessment", retry: "retrieveMore", end: END })
  .addConditionalEdges("generateAssessment", (s) => (s.error ? "end" : "validate"), { validate: "validateAssessment", end: END })
  .addConditionalEdges("validateAssessment", (s) => (s.error ? "end" : s.validationErrors?.length ? "retry" : "done"), { retry: "generateAssessment", done: END, end: END })
  .compile();

export const runAssessmentGraph = (input) => graph.invoke(input);
