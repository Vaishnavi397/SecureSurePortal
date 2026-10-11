// Turns the raw text of a small/free LLM into the object our validator expects.
// Handles the usual ways models drift from the requested format:
//   <think>...</think> blocks, ```json fences, text before/after the JSON, snake_case keys,
//   "82%" confidence, clause references returned as plain strings, null instead of [].
// Safety is unchanged: the validator still requires every cited clause to be a retrieved clause.

const RECS = ["LIKELY_COVERED", "LIKELY_NOT_COVERED", "NEEDS_MORE_INFORMATION", "NEEDS_MANUAL_REVIEW"];
const CLAUSE_RE = /\b[A-Z]{3}-\d+\b/;

// Find the first balanced {...} that parses as JSON.
function extractJson(text) {
  let t = String(text || "")
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<think>[\s\S]*$/i, "") // unclosed think block
    .replace(/```(?:json)?/gi, "");
  for (let start = t.indexOf("{"); start !== -1; start = t.indexOf("{", start + 1)) {
    let depth = 0, inStr = false, esc = false;
    for (let i = start; i < t.length; i++) {
      const ch = t[i];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === "\\") esc = true;
        else if (ch === '"') inStr = false;
      } else if (ch === '"') inStr = true;
      else if (ch === "{") depth++;
      else if (ch === "}" && --depth === 0) {
        try { return JSON.parse(t.slice(start, i + 1)); } catch { break; }
      }
    }
  }
  return null;
}

const keyOf = (k) => k.toLowerCase().replace(/[^a-z]/g, "");
const pick = (obj, ...names) => {
  const map = new Map(Object.keys(obj).map((k) => [keyOf(k), obj[k]]));
  for (const n of names) if (map.has(keyOf(n)) && map.get(keyOf(n)) != null) return map.get(keyOf(n));
  return undefined;
};
const asText = (v) => (Array.isArray(v) ? v.map(String).join(" ") : v == null ? "" : String(v)).trim();

function normRecommendation(v) {
  const s = String(v || "").toUpperCase().replace(/[^A-Z]+/g, "_").replace(/^_+|_+$/g, "");
  if (RECS.includes(s)) return s;
  if (/NOT_COVERED|NOT_LIKELY|REJECT|DENY|DECLIN/.test(s)) return "LIKELY_NOT_COVERED";
  if (/MORE_INFO|MISSING|ADDITIONAL|INSUFFICIENT/.test(s)) return "NEEDS_MORE_INFORMATION";
  if (/MANUAL|REVIEW|ESCALAT/.test(s)) return "NEEDS_MANUAL_REVIEW";
  if (/COVERED|APPROV/.test(s)) return "LIKELY_COVERED";
  return v;
}

function normConfidence(v) {
  let n = typeof v === "string" ? parseFloat(v.replace("%", "")) : Number(v);
  if (Number.isNaN(n)) return v;
  if (n > 1) n = n / 100;
  return Math.min(1, Math.max(0, n));
}

function normReferences(v) {
  if (v == null) return [];
  const list = Array.isArray(v) ? v : [v];
  return list
    .map((r) => {
      if (typeof r === "string") return { clauseId: (r.match(CLAUSE_RE) || [r.trim()])[0], relevance: r.trim() };
      if (r && typeof r === "object") {
        const raw = asText(pick(r, "clauseId", "clause", "id", "reference"));
        return { clauseId: (raw.match(CLAUSE_RE) || [raw])[0], relevance: asText(pick(r, "relevance", "reason", "description", "summary", "explanation")) || "Relevant policy clause" };
      }
      return null;
    })
    .filter((r) => r && r.clauseId);
}

export function normalizeAssessment(o) {
  if (!o || typeof o !== "object" || Array.isArray(o)) return null;
  const summary = asText(pick(o, "summary", "assessment", "overview")) || asText(pick(o, "reasoning", "explanation"));
  const reasoning = asText(pick(o, "reasoning", "explanation", "rationale")) || summary;
  const missing = pick(o, "missingInformation", "missingDocuments", "missing");
  return {
    recommendation: normRecommendation(pick(o, "recommendation", "decision", "verdict")),
    summary,
    reasoning,
    confidence: normConfidence(pick(o, "confidence", "confidenceScore")),
    policyReferences: normReferences(pick(o, "policyReferences", "references", "policyClauses", "citations")),
    missingInformation: missing == null ? [] : (Array.isArray(missing) ? missing : [missing]).map(String),
    recommendedAction: asText(pick(o, "recommendedAction", "action", "nextStep", "nextSteps")),
  };
}

export function parseAssessmentText(text) {
  return normalizeAssessment(extractJson(text));
}
