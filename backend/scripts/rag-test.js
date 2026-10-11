// Offline RAG test (no MongoDB / no API key needed):  npm run test:rag
import assert from "node:assert/strict";
import { initRag, search } from "../src/ai/ragService.js";

const cases = [
  { claimType: "MOTOR", q: "motor accident claim required documents and exclusions", expectClause: /^MOT-/ },
  { claimType: "HEALTH", q: "hospitalisation claim exclusions pre-existing conditions", expectClause: /^HLT-/ },
  { claimType: "TRAVEL", q: "trip cancellation change of plans exclusion", expectClause: /^TRV-/ },
  { claimType: "PROPERTY", q: "fire damage claim limit surveyor report", expectClause: /^PRP-/ },
];

await initRag();
let pass = 0;
for (const c of cases) {
  const results = await search(c.q, { claimType: c.claimType, k: 5, fetchK: 12 });
  assert.ok(results.length > 0, `${c.claimType}: no results`);
  assert.ok(results.some((r) => c.expectClause.test(r.clauseId)), `${c.claimType}: expected ${c.expectClause} in ${results.map((r) => r.clauseId)}`);
  assert.ok(results.every((r) => r.category === c.claimType || r.category === "GENERAL"), `${c.claimType}: leaked other category`);
  console.log(`PASS  ${c.claimType.padEnd(9)} -> ${results.map((r) => `${r.clauseId}(${r.score})`).join(", ")}`);
  pass++;
}
console.log(`\nRAG retrieval test: ${pass}/${cases.length} passed`);
