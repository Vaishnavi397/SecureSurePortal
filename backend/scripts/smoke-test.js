// End-to-end API smoke test. Prerequisites: MongoDB seeded (npm run seed) and the backend
// running (npm run dev) in another terminal.   Run:  npm run test:smoke
// Optional: API_URL=http://localhost:5000
import { io } from "socket.io-client";

const API = process.env.API_URL || "http://localhost:5000";
const results = [];
let token = "";

async function http(method, path, { body, auth = true, headers = {}, raw } = {}) {
  const res = await fetch(API + path, {
    method,
    headers: { ...(raw ? {} : body ? { "Content-Type": "application/json" } : {}), ...(auth && token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: raw || (body ? JSON.stringify(body) : undefined),
  });
  let json = null;
  try { json = await res.json(); } catch { /* no body */ }
  return { status: res.status, json };
}
async function test(name, fn) {
  try {
    const note = await fn();
    results.push(["PASS", name, note || ""]);
  } catch (e) {
    if (e.skip) results.push(["SKIP", name, e.message]);
    else results.push(["FAIL", name, e.message]);
  }
}
const eq = (a, b, msg) => { if (a !== b) throw new Error(`${msg || "mismatch"}: expected ${b}, got ${a}`); };
const ok = (c, msg) => { if (!c) throw new Error(msg); };
const skip = (m) => { throw Object.assign(new Error(m), { skip: true }); };

await test("17. GET /health is operational", async () => {
  const r = await http("GET", "/health", { auth: false });
  eq(r.status, 200, "status"); eq(r.json.status, "ok", "body.status");
  return `mongo=${r.json.mongo} rag.ready=${r.json.rag?.ready} llm=${r.json.llmProvider}`;
});
await test("2. Invalid login rejected (401)", async () => {
  const r = await http("POST", "/auth/login", { auth: false, body: { email: "officer@securesure.com", password: "wrong" } });
  eq(r.status, 401);
});
await test("1. Successful login returns JWT", async () => {
  const r = await http("POST", "/auth/login", { auth: false, body: { email: "officer@securesure.com", password: "Officer@123" } });
  eq(r.status, 200); ok(r.json.token, "no token"); token = r.json.token;
});
await test("3. Missing JWT -> 401", async () => eq((await http("GET", "/api/claims", { auth: false })).status, 401));
await test("4. Invalid JWT -> 401", async () => eq((await http("GET", "/api/claims", { auth: false, headers: { Authorization: "Bearer not.a.token" } })).status, 401));

let claims = [];
await test("5. Get claims (+ response time)", async () => {
  const t = Date.now(); const r = await http("GET", "/api/claims"); const ms = Date.now() - t;
  eq(r.status, 200); ok(r.json.count >= 5, "expected seeded claims"); claims = r.json.claims;
  return `${r.json.count} claims in ${ms} ms (target < 500 ms for ~500)`;
});
await test("6. Filter claims by type/status/priority", async () => {
  const r = await http("GET", "/api/claims?claimType=MOTOR&priority=HIGH");
  eq(r.status, 200); ok(r.json.claims.every((c) => c.claimType === "MOTOR" && c.priority === "HIGH"), "filter leaked");
  eq((await http("GET", "/api/claims?claimType=BOGUS")).status, 400, "invalid filter");
  return `${r.json.count} MOTOR+HIGH`;
});
await test("7. Get claim details", async () => {
  const r = await http("GET", "/api/claims/CLM-1001"); eq(r.status, 200); eq(r.json.claim.claimNumber, "CLM-1001");
  ok(Array.isArray(r.json.allowedTransitions), "no allowedTransitions");
});
await test("Errors: invalid id -> 400, unknown -> 404", async () => {
  eq((await http("GET", "/api/claims/xyz")).status, 400); eq((await http("GET", "/api/claims/CLM-9999999")).status, 404);
});
await test("9. Invalid status transition -> 400", async () => {
  const r = await http("PATCH", "/api/claims/CLM-1001/status", { body: { status: "CLOSED" } }); eq(r.status, 400); eq(r.json.error.code, "INVALID_TRANSITION");
});
await test("8/10/11. Status update persists in MongoDB + Socket.io event", async () => {
  const socket = io(API, { auth: { token }, transports: ["websocket"] });
  await new Promise((res, rej) => { socket.on("connect", res); socket.on("connect_error", (e) => rej(new Error("socket: " + e.message))); setTimeout(() => rej(new Error("socket connect timeout")), 5000); });
  const evt = new Promise((res, rej) => { socket.on("claimStatusUpdated", res); setTimeout(() => rej(new Error("no claimStatusUpdated event within 5s")), 5000); });
  const cur = (await http("GET", "/api/claims/CLM-1001")).json.claim.status;
  ok(cur === "UNDER_REVIEW", `CLM-1001 must be UNDER_REVIEW (is ${cur}); run npm run seed`);
  const r = await http("PATCH", "/api/claims/CLM-1001/status", { body: { status: "ADDITIONAL_INFO_REQUIRED", note: "smoke test" } });
  eq(r.status, 200);
  const e = await evt; eq(e.claimNumber, "CLM-1001"); eq(e.to, "ADDITIONAL_INFO_REQUIRED");
  eq((await http("GET", "/api/claims/CLM-1001")).json.claim.status, "ADDITIONAL_INFO_REQUIRED", "not persisted");
  await http("PATCH", "/api/claims/CLM-1001/status", { body: { status: "UNDER_REVIEW" } }); // restore
  socket.close();
  return "persisted + event received";
});
await test("Socket without JWT is refused", async () => {
  const s = io(API, { transports: ["websocket"], reconnection: false });
  const err = await new Promise((res) => { s.on("connect_error", res); s.on("connect", () => res(null)); setTimeout(() => res("timeout"), 4000); });
  s.close(); ok(err && err.message === "AUTH_REQUIRED", "socket should be refused");
});
await test("14. RAG policy search", async () => {
  const r = await http("GET", "/api/policies/search?q=" + encodeURIComponent("accident required documents") + "&claimType=MOTOR");
  eq(r.status, 200); ok(r.json.count > 0, "no results"); return r.json.results.map((x) => x.clauseId).join(", ");
});

const seen = new Map();
for (const n of ["CLM-1001", "CLM-1002", "CLM-1003", "CLM-1004", "CLM-1005"]) {
  await test(`13/15. AI assessment ${n}`, async () => {
    const r = await http("POST", `/api/claims/${n}/generate-assessment`);
    eq(r.status, 200, JSON.stringify(r.json?.error || "")); const a = r.json.assessment;
    ok(a.policyReferences.length > 0, "no policy references (not grounded)"); ok(a.advisoryOnly === true, "advisoryOnly flag");
    seen.set(n, a.recommendation);
    return `${a.recommendation} (conf ${a.confidence}) refs=${a.policyReferences.map((p) => p.clauseId)} missing=${a.missingInformation.length} model=${a.model.provider}`;
  });
}
await test("AC11. >= 3 meaningfully different assessments", async () => {
  const distinct = new Set(seen.values()); ok(distinct.size >= 3, `only ${distinct.size} distinct outcome(s): ${[...distinct]}`); return [...distinct].join(" | ");
});
await test("16a. RAG failure handled (503) and server stays up", async () => {
  eq((await http("POST", "/api/claims/CLM-1002/generate-assessment?simulateFailure=rag")).status, 503); eq((await http("GET", "/health", { auth: false })).status, 200);
});
await test("16b. LLM failure handled (502) and server stays up", async () => {
  eq((await http("POST", "/api/claims/CLM-1002/generate-assessment?simulateFailure=llm")).status, 502); eq((await http("GET", "/health", { auth: false })).status, 200);
});
await test("12. S3 upload", async () => {
  const pdf = new Blob(["%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF"], { type: "application/pdf" });
  const form = new FormData(); form.append("file", pdf, "smoke-test.pdf"); form.append("docType", "FIR_COPY");
  const r = await http("POST", "/api/claims/CLM-1005/documents", { raw: form });
  if (r.status === 503 && r.json?.error?.code === "S3_NOT_CONFIGURED") skip("S3 not configured: set S3_BUCKET + AWS credentials in .env, then re-run");
  eq(r.status, 201, JSON.stringify(r.json?.error || "")); return "stored in S3 + metadata saved";
});
await test("12b. S3 failure handled (502)", async () => {
  const form = new FormData(); form.append("file", new Blob(["%PDF-1.4 x"], { type: "application/pdf" }), "x.pdf");
  const r = await http("POST", "/api/claims/CLM-1005/documents?simulateFailure=s3", { raw: form });
  if (r.status === 503) skip("S3 not configured");
  eq(r.status, 502);
});

console.log("\n=========== SMOKE TEST RESULTS ===========");
for (const [s, n, note] of results) console.log(`${s.padEnd(5)} ${n}${note ? "  -> " + note : ""}`);
const failed = results.filter((r) => r[0] === "FAIL").length;
console.log(`\n${results.filter((r) => r[0] === "PASS").length} passed, ${failed} failed, ${results.filter((r) => r[0] === "SKIP").length} skipped`);
process.exit(failed ? 1 : 0);
