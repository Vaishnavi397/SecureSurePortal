# Acceptance Criteria Mapping

"Verify" = run the command and look for PASS. Items that need your AWS/LLM accounts are marked **needs your account**.

| AC | Criterion | Implementation | Test / demo method | Status |
|---|---|---|---|---|
| AC1 | JWT authentication | `POST /auth/login`, `authController.js`, bcrypt + jsonwebtoken | smoke test #1/#2; UI login | Implemented: verify |
| AC2 | Retrieve & view claims | `GET /api/claims`, Dashboard + ClaimList | smoke #5; UI | Implemented: verify |
| AC3 | Filter claims | query params `claimType,status,priority,search`; FilterPanel | smoke #6; UI filters | Implemented: verify |
| AC4 | View claim details | `GET /api/claims/:id`, ClaimPage | smoke #7; UI | Implemented: verify |
| AC5 | Update claim status | `PATCH /api/claims/:id/status`, StatusControl, lifecycle in `claimWorkflow.js` | smoke #8/#9; UI | Implemented: verify |
| AC6 | Invalid JWT rejected | `middleware/auth.js` → 401 | smoke #3/#4 | Implemented: verify |
| AC7 | Status persisted in MongoDB | `claim.save()` before broadcast; `statusHistory` | smoke #8 re-reads claim; Atlas/Compass | Implemented: verify |
| AC8 | Status via Socket.io | `socketService.js` event `claimStatusUpdated` (JWT-authenticated sockets) | smoke socket test; 2 browser windows | Implemented: verify |
| AC9 | Generate AI assessment | `POST /api/claims/:id/generate-assessment`, AssessmentPanel | smoke 13/15; UI | Implemented: verify (**needs your LLM key** for real GenAI; mock mode otherwise) |
| AC10 | Grounded in retrieved policy | multi-query retrieval; prompt allows only retrieved clauses; validator rejects clause IDs not retrieved | policy references shown in UI; smoke asserts references present | Implemented: verify |
| AC11 | ≥3 scenarios, meaningful | 5 seeded claims (MOTOR missing docs, HEALTH complete, TRAVEL exclusion, PROPERTY over limit, MOTOR alcohol exclusion) | smoke "AC11" asserts ≥3 distinct outcomes | Implemented: verify |
| AC12 | RAG & AI failures handled | LangGraph error routing; `?simulateFailure=rag\|llm`; empty retrieval → 422; timeout/429 mapped | smoke 16a/16b; UI shows message | Implemented: verify |
| AC13 | Upload to S3 | `documentService.js` (PutObject, SSE, file-signature check) + DocumentPanel | smoke 12; UI upload then "View" | **BLOCKED until you set S3_BUCKET + AWS credentials** |
| AC14 | Deployed on AWS | `Dockerfile` + `terraform/` (ECS Fargate) | README step 10; open `http://<ip>:8080` | **BLOCKED until you run it in your AWS account** |
| AC15 | CloudWatch configured | JSON logs → awslogs; log group, metric filter, alarm in Terraform | CloudWatch console / Logs Insights | **BLOCKED until deployed** |
| AC16 | Health endpoint | `GET /health` | smoke #17; `curl http://<host>/health` | Implemented: verify |
| AC17 | End-to-end flow | whole app | `docs/DEMO_SCRIPT.md` | Verify after S3 + LLM configured |

Terraform add-on (TF1-TF6): TF1-TF4 in `terraform/main.tf`; TF5 (AWS Q Developer) is a process step: use Q Developer in your IDE to review/extend the HCL and mention it in the demo; TF6: `terraform validate`.

Not verified in the build environment: `npm install`, `terraform validate`, AWS, S3 and real-LLM calls (no network there). Code was syntax-checked and the retrieval logic was simulated offline.
