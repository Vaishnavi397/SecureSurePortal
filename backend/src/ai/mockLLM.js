// OFFLINE DEMO MODE ONLY (LLM_PROVIDER=mock). This is NOT a language model: it applies simple
// deterministic rules to the claim and the RETRIEVED policy chunks so the whole pipeline
// (RAG -> LangGraph -> validation -> UI) can be demonstrated without an API key.
// Configure a real provider (anthropic/openai) for genuine GenAI assessments.
const EXCLUSION_TRIGGERS = [
  { claim: /chang(ed|e) (of )?(my )?(mind|plans?)|no longer (wish|want)/i, chunk: /change of mind|voluntary change/i },
  { claim: /alcohol|drunk|intoxicat|under the influence/i, chunk: /alcohol|influence/i },
  { claim: /pre-?existing|chronic condition/i, chunk: /pre-existing/i },
  { claim: /cosmetic|plastic surgery/i, chunk: /cosmetic/i },
  { claim: /without (a )?(valid )?licen[cs]e|expired licen[cs]e/i, chunk: /licen[cs]e/i },
  { claim: /wear and tear|gradual/i, chunk: /wear and tear/i },
];

const firstSentence = (text) => text.split("\n").slice(1).join(" ").split(/(?<=\.)\s/)[0].slice(0, 160);

export function mockGenerate({ claim, chunks }) {
  const uploaded = new Set(claim.supportingDocuments.map((d) => d.docType));
  const byClause = new Map(chunks.map((c) => [c.clauseId, c]));

  const docChunk = chunks.find((c) => /Required documents:/i.test(c.text) && c.category === claim.claimType);
  const required = docChunk ? docChunk.text.match(/Required documents:\s*([A-Z_,\s]+?)\./)?.[1].split(",").map((s) => s.trim()).filter(Boolean) || [] : [];
  const missing = required.filter((d) => !uploaded.has(d));

  const limitChunk = chunks.find((c) => /Maximum payable/i.test(c.text) && c.category === claim.claimType);
  const limit = limitChunk ? Number(limitChunk.text.match(/Maximum payable[^₹]*₹([\d,]+)/)?.[1]?.replace(/,/g, "")) : null;

  const exclusionChunk = chunks.find((c) => EXCLUSION_TRIGGERS.some((t) => t.claim.test(claim.incidentDescription) && t.chunk.test(c.text) && /excluded/i.test(c.text)));

  let recommendation, confidence, summary, action;
  if (exclusionChunk) {
    recommendation = "LIKELY_NOT_COVERED"; confidence = 0.82;
    summary = `The incident description matches an exclusion in clause ${exclusionChunk.clauseId}, so the claim appears not to be covered. Officer verification is required before any decision.`;
    action = "Verify the facts with the customer; if confirmed, prepare a rejection with the cited exclusion for officer decision.";
  } else if (missing.length) {
    recommendation = "NEEDS_MORE_INFORMATION"; confidence = 0.8;
    summary = `The incident type appears to fall under the ${claim.claimType} cover, but required documents are missing (${missing.join(", ")}). A decision cannot be made until they are supplied.`;
    action = "Move the claim to ADDITIONAL_INFO_REQUIRED and request the missing documents from the customer.";
  } else if (limit && claim.claimedAmount > limit) {
    recommendation = "NEEDS_MANUAL_REVIEW"; confidence = 0.7;
    summary = `Documents are complete, but the claimed amount (₹${claim.claimedAmount.toLocaleString("en-IN")}) exceeds the maximum payable limit of ₹${limit.toLocaleString("en-IN")}. Senior review is needed to decide the payable amount.`;
    action = "Escalate to a senior officer to review the payable amount against the policy limit.";
  } else {
    recommendation = "LIKELY_COVERED"; confidence = 0.85;
    summary = `The incident appears to be covered, required documents are present and the amount is within the policy limit. Standard verification can proceed.`;
    action = "Complete standard verification; the officer may proceed to a decision.";
  }

  const refOrder = [exclusionChunk, docChunk, limitChunk, chunks.find((c) => c.category === claim.claimType && /-1$/.test(c.clauseId)), chunks.find((c) => c.category === "GENERAL")].filter(Boolean);
  const refs = [...new Map(refOrder.map((c) => [c.clauseId, c])).values()].slice(0, 4);
  if (!refs.length && chunks[0]) refs.push(chunks[0]);

  return JSON.stringify({
    recommendation,
    summary,
    reasoning: `Rule-based offline assessment using retrieved clauses: ${refs.map((r) => r.clauseId).join(", ")}.`,
    confidence,
    policyReferences: refs.map((c) => ({ clauseId: c.clauseId, relevance: firstSentence(c.text) })),
    missingInformation: missing,
    recommendedAction: action,
  });
}
