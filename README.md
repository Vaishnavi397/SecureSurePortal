# SecureSure Claims Portal: AI-Powered Insurance Claim Triage & Assessment

Training project (Track B, DX-IN). A claims officer logs in, filters claims, opens one, uploads a
document to S3, searches policy text, generates an **advisory** AI assessment grounded in retrieved
policy clauses (LangChain RAG + LangGraph + GenAI), updates the status and every connected user
gets a real-time Socket.io notification.

```
React (Vite) ──► Express API ──► MongoDB (Mongoose)
                    │  ├─► Socket.io  (claimStatusUpdated broadcast)
                    │  ├─► Amazon S3  (documents)
                    │  └─► AI service: LangGraph ─► LangChain retriever (similarity + MMR)
                    │                              ─► LLM (Anthropic / OpenAI)
                    └─► JSON logs ─► CloudWatch (ECS awslogs)      Terraform provisions ECS, S3, IAM, ECR, CloudWatch
```

## Folder structure
```
securesure-claims-portal/
├── backend/            Node + Express API  (run npm commands HERE)
│   ├── src/ (routes, controllers, services, models, middleware, sockets, ai/, config, utils)
│   ├── src/ai/knowledge/   fictional policy documents used by RAG
│   ├── scripts/            rag-test.js, smoke-test.js
│   └── .env.example
├── frontend/           React + Vite UI     (run npm commands HERE)
├── terraform/          AWS infrastructure
├── docs/               ACCEPTANCE.md, DEMO_SCRIPT.md
├── Dockerfile          one image = API + built React app (for ECS)
└── docker-compose.yml  optional local MongoDB only
```

## 1. Prerequisites (install once)
| Tool | Check with |
|---|---|
| Node.js **20+** (18.18+ works) | `node -v` |
| MongoDB: **Atlas free cluster** (easiest) OR local MongoDB OR Docker | see step 3 |
| (for S3 demo) an AWS account + an S3 bucket + access keys | step 6 |
| (for real AI) an Anthropic **or** OpenAI API key | step 5 |
| (for deployment) Docker, AWS CLI, Terraform | step 10 |

## 2. Install dependencies
Open **two terminals**.
```bash
# Terminal A
cd securesure-claims-portal/backend
npm install

# Terminal B
cd securesure-claims-portal/frontend
npm install
```
If npm reports peer-dependency errors in `backend`, run `npm install --legacy-peer-deps` (the included `.npmrc` already does this).

## 3. MongoDB
Pick ONE:
- **Atlas (recommended):** create a free cluster → Database Access: add a user → Network Access: allow your IP (or 0.0.0.0/0 for the demo) → Connect → Drivers → copy the string, e.g. `mongodb+srv://USER:PASS@cluster0.xxxx.mongodb.net/securesure`.
- **Docker:** from the project root `docker compose up -d` → use `mongodb://127.0.0.1:27017/securesure`.
- **Installed locally:** start `mongod` → use `mongodb://127.0.0.1:27017/securesure`.

## 4. Configure environment (backend)
```bash
cd securesure-claims-portal/backend
cp .env.example .env        # Windows PowerShell: copy .env.example .env
```
Edit `backend/.env`: set `MONGODB_URI` and a long random `JWT_SECRET`. Everything else is optional for a first run.

| Variable | Purpose |
|---|---|
| `MONGODB_URI`, `JWT_SECRET` | **required** |
| `PORT` (5000), `CORS_ORIGIN` (http://localhost:5173) | server / CORS |
| `S3_BUCKET`, `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | document upload to S3 |
| `LLM_PROVIDER` (`anthropic`/`openai`/`openai-compatible`/`mock`), `LLM_MODEL`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `LLM_TIMEOUT_MS` | GenAI |
| `EMBEDDINGS_PROVIDER` (`local`/`openai`) | RAG embeddings |
| `ALLOW_FAILURE_SIMULATION` | enables `?simulateFailure=rag\|llm\|s3` outside dev (dev already allows it) |

Never commit `.env` (it is git-ignored).

## 5. AI configuration
- **Real GenAI (what the evaluator expects):** put `ANTHROPIC_API_KEY=...` (or `OPENAI_API_KEY=...`) in `backend/.env`. For OpenRouter/OpenAI-compatible setups, prefer the paid model slug such as `qwen/qwen3-30b-a3b` instead of a retired `:free` alias. The provider is auto-detected; override with `LLM_PROVIDER` / `LLM_MODEL`.
- **No key yet?** With no key the backend uses `mock` mode: a deterministic rule-based engine that still runs the full RAG → LangGraph → validation pipeline, but is **not a real LLM**. The UI shows a yellow banner when this is active. Use a real key for the final demo.

## 6. S3 setup
1. AWS Console → S3 → create a bucket (e.g. `securesure-docs-yourname`), keep "Block all public access" ON.
2. IAM → create a user with permission `s3:PutObject`, `s3:GetObject`, `s3:ListBucket` on that bucket → create access keys.
3. Put `S3_BUCKET`, `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` in `backend/.env`.
(Or run `aws configure` and leave the key variables empty. On ECS the task IAM role is used automatically, no keys.)

## 7. Seed demo data (backend folder)
```bash
cd securesure-claims-portal/backend
npm run seed                 # 2 users + 5 demo claims (re-running resets everything)
npm run seed -- --bulk=500   # optional: +500 claims to check the "<500 ms for ~500 claims" target
```

## 8. Run the app
```bash
# Terminal A: API on http://localhost:5000
cd securesure-claims-portal/backend
npm run dev

# Terminal B: UI on http://localhost:5173
cd securesure-claims-portal/frontend
npm run dev
```
Open http://localhost:5173. **Demo credentials:** `officer@securesure.com` / `Officer@123` (also `manager@securesure.com` / `Manager@123`).
Real-time check: open the app in two browser windows (one normal, one private), change a status in one, and see the toast in the other.

## 9. Tests
```bash
cd securesure-claims-portal/backend
npm run test:rag      # offline; needs only `npm install` (no MongoDB, no keys)
npm run seed          # reset data
npm run dev           # keep running in another terminal, then:
npm run test:smoke    # auth, claims, filter, transitions, persistence, socket, RAG, 5 assessments, failure handling, /health, S3
```
The smoke test prints PASS / FAIL / SKIP per item (S3 shows SKIP until `S3_BUCKET` + credentials are set).

## 10. Deploy to AWS (ECS Fargate) with Terraform
```bash
cd securesure-claims-portal/terraform
cp terraform.tfvars.example terraform.tfvars      # fill in mongodb_uri (Atlas), jwt_secret, an LLM key
aws configure                                      # once
terraform init
terraform validate
terraform plan
terraform apply                                    # first apply: desired_count=0 (creates ECR, S3, IAM, ECS, CloudWatch)

# build + push the image (run from the PROJECT ROOT)
cd ..
ECR=$(cd terraform && terraform output -raw ecr_repository_url)
aws ecr get-login-password --region ap-south-1 | docker login --username AWS --password-stdin ${ECR%%/*}
docker build -t $ECR:latest .
docker push $ECR:latest

# start the service
cd terraform
terraform apply -var desired_count=1
```
Then: AWS Console → ECS → cluster → service → Tasks → open the task → copy its **public IP** → `http://<ip>:8080/health` and `http://<ip>:8080/`.
Seed the cloud DB (it is the same Atlas DB): run `npm run seed` locally with the Atlas `MONGODB_URI` in `backend/.env`.
Clean up: `terraform destroy` (the bucket has `force_destroy`, so it works even with files in it).

Terraform notes: secrets are passed through sensitive variables (`terraform.tfvars`, git-ignored). They end up in the **local state file**, so never commit `*.tfstate` (already git-ignored) and use a remote encrypted backend in real projects.

## 11. CloudWatch
- The backend writes JSON logs to stdout; ECS `awslogs` ships them to log group `/ecs/securesure-claims-dev`.
- Logged: startup, login failures, missing/invalid JWT, status changes, S3 failures, RAG/AI failures, unexpected errors. No passwords, tokens or customer names are logged.
- Terraform also creates a metric filter (`{ $.level = "error" }` → `SecureSure/Claims AppErrorCount`) and an alarm (≥5 errors in 5 min).
- Demo: CloudWatch → Log groups → `/ecs/...` → Logs Insights: `fields @timestamp, msg, level | filter msg = "claim_status_changed"`.

## 12. API (as in the workbook)
| Method | Endpoint | Auth | Notes |
|---|---|---|---|
| POST | `/auth/login` | no | `{email,password}` → `{token,user}` |
| GET | `/api/claims` | yes | filters: `claimType, status, priority, search` |
| GET | `/api/claims/:id` | yes | id = Mongo id or `CLM-1001`; returns `allowedTransitions` |
| PATCH | `/api/claims/:id/status` | yes | `{status, note?}`; enforces lifecycle; emits `claimStatusUpdated` |
| GET | `/api/policies/search?q=&claimType=` | yes | RAG retrieval (similarity + MMR) |
| POST | `/api/claims/:id/documents` | yes | multipart `file` + `docType`; stored in S3 |
| GET | `/api/claims/:id/documents/:docId/url` | yes | 5-minute presigned download link |
| POST | `/api/claims/:id/generate-assessment` | yes | LangGraph + LLM; saved on the claim |
| GET | `/health` | no | `{status:"ok", mongo, rag, ...}` |

Errors always look like `{ "error": { "code": "...", "message": "..." } }` with 400 / 401 / 404 / 422 / 429 / 502 / 503 as appropriate.

**Status lifecycle:** NEW → UNDER_REVIEW → (ADDITIONAL_INFO_REQUIRED ↔ UNDER_REVIEW) → APPROVED | REJECTED; APPROVED → SETTLEMENT_IN_PROGRESS → CLOSED; REJECTED → CLOSED.

## 13. Demo (10 steps, ~8 minutes): see `docs/DEMO_SCRIPT.md`. Acceptance mapping: `docs/ACCEPTANCE.md`.

## 14. Known simplifications
1. **Embeddings:** default is a local hashed bag-of-words LangChain `Embeddings` class (offline, no key). Retrieval is real (MemoryVectorStore, similarity + MMR) but less semantic than OpenAI embeddings (`EMBEDDINGS_PROVIDER=openai`).
2. **Vector store is in-memory**, rebuilt at startup from `src/ai/knowledge/*.md` (policy documents live in the repo, not S3).
3. **Mock LLM mode** exists only for offline demos; use a real key to satisfy "GenAI API".
4. **REJECTED → CLOSED** transition is our interpretation of the lifecycle list.
5. **All authenticated users** may update status (workbook BRULE1); roles are in the JWT but not enforced.
6. **Terraform:** default VPC, no load balancer / Route 53 / Auto Scaling (workbook Terraform scope is ECS + S3 + IAM). The task is reached by its public IP.
7. **Workbook conflict:** the UseCase sheet lists Terraform as "excluded", but the Terraform add-on sheet requires it, so it is included.
8. Seeded documents are metadata-only records (no file in S3); newly uploaded files are real.
