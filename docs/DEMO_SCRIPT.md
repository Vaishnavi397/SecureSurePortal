# 8-Minute Demo Script

**Before you start:** `npm run seed` (backend), backend + frontend running, `.env` has S3 + an LLM key, a small PDF ready, second browser window (private) logged in.

1. **(0:30) Architecture.** Say: "React → Express → MongoDB; Socket.io for live updates; S3 for documents; LangChain RAG + LangGraph + GenAI for assessment; deployed on ECS with Terraform; logs in CloudWatch."
2. **(0:30) Login** `officer@securesure.com / Officer@123` → JWT. (Optionally show a request without a token returning 401.)
3. **(0:45) Dashboard.** Point at counts, amounts, statuses.
4. **(0:30) Filter:** type = MOTOR, priority = HIGH; then Reset.
5. **(0:45) Open CLM-1001** (Motor, ₹2,50,000): details, status history.
6. **(0:45) Upload document:** type FIR COPY, pick the PDF → success → click **View** (presigned S3 URL). Mention the S3 console.
7. **(0:45) Policy search:** query "required documents accident" → clause IDs with scores (similarity + MMR).
8. **(1:30) Generate AI assessment** on CLM-1001. Show recommendation, missing documents (e.g., REPAIR_ESTIMATE), cited clauses, LangGraph trace. Then open **CLM-1003** (voluntary cancellation → exclusion TRV-4) and **CLM-1004** (exceeds limit → manual review) to show different outcomes. Stress "advisory only".
9. **(1:00) Real-time:** in window 2 keep the dashboard open; in window 1 change CLM-1001 → ADDITIONAL INFO REQUIRED. Toast appears in window 2; try an invalid jump (UNDER REVIEW → CLOSED is not offered / API returns 400). Show the change in MongoDB.
10. **(0:45) AWS:** `http://<ip>:8080/health`; CloudWatch Logs Insights showing `claim_status_changed`; mention Terraform (`terraform plan/apply/destroy`) and the error alarm.
11. **(0:30) Failure handling:** `POST .../generate-assessment?simulateFailure=llm` (dev) → friendly 502; app keeps running.

**Likely failure points:** Atlas IP not allow-listed; `.env` not created in `backend/`; S3 bucket/region/credentials mismatch; ECS task has no public IP/security group port 8080; LLM key missing (UI banner shows mock mode); seeding not re-run after the smoke test changed statuses (re-run `npm run seed`).
