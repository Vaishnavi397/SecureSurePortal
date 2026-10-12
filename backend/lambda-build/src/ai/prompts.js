// Prompt structure follows the workbook's "AI Prompt Structure" sheet.
export function buildPrompt(claim, chunks, feedback = []) {
  const docs = claim.supportingDocuments.length
    ? claim.supportingDocuments.map((d) => d.docType).join(", ")
    : "NONE";
  const policy = chunks.map((c) => `[${c.clauseId}] (${c.source})\n${c.text}`).join("\n\n");
  const fix = feedback.length ? `\nYOUR PREVIOUS ANSWER WAS REJECTED. Fix these problems:\n- ${feedback.join("\n- ")}\n` : "";

  return `ROLE
You are an insurance claims assessment assistant for SecureSure Insurance. You support a human claims officer.

CLAIM CONTEXT
Claim number: ${claim.claimNumber}
Claim type: ${claim.claimType}
Priority: ${claim.priority}
Incident date: ${new Date(claim.incidentDate).toISOString().slice(0, 10)}
Claimed amount (INR): ${claim.claimedAmount}
Incident description: ${claim.incidentDescription}
Uploaded document types: ${docs}

POLICY CONTEXT (retrieved policy clauses - the ONLY source of policy rules you may use)
${policy}

TASK
Prepare a concise claim assessment summary. Identify: (1) the relevant policy conditions, (2) missing information or missing required documents, (3) the recommended next action for the officer.

CONSTRAINTS
- Do NOT make a final legal or financial decision.
- Do NOT invent policy clauses, limits or coverage. Cite only clause IDs shown above (e.g. MOT-3).
- Do NOT approve or reject the claim. Your output is advisory; the claims officer decides.
- If a required document is not in "Uploaded document types", list it under missingInformation.
${fix}
OUTPUT
Respond with ONLY a JSON object (no markdown fences, no <think> text, nothing before or after the JSON) with exactly these keys:
{
  "recommendation": "LIKELY_COVERED" | "LIKELY_NOT_COVERED" | "NEEDS_MORE_INFORMATION" | "NEEDS_MANUAL_REVIEW",
  "summary": "2-3 sentence concise assessment",
  "reasoning": "short explanation tied to the cited clauses",
  "confidence": number between 0 and 1,
  "policyReferences": [ { "clauseId": "MOT-3", "relevance": "why this clause matters" } ],
  "missingInformation": [ "..." ],
  "recommendedAction": "next step for the officer"
}`;
}
