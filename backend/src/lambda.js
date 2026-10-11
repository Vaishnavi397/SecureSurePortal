// AWS Lambda entry point (used instead of server.js when running behind API Gateway).
// - Reuses the SAME Express app (createApp) through the serverless-http adapter.
// - Reads secrets (Mongo URI, JWT secret, LLM key) from SSM Parameter Store on cold start.
// - Also handles the background AI-assessment job (event.task === "assess").
import serverless from "serverless-http";

const SECRET_NAMES = ["MONGODB_URI", "JWT_SECRET", "LLM_API_KEY"];
let ready = null; // survives between invocations while the Lambda container stays warm

async function loadSecrets() {
  const prefix = process.env.SECRETS_SSM_PREFIX;
  if (!prefix) return; // not running with SSM (e.g. secrets already in the environment)
  const { SSMClient, GetParametersCommand } = await import("@aws-sdk/client-ssm");
  const res = await new SSMClient({}).send(
    new GetParametersCommand({ Names: SECRET_NAMES.map((n) => `${prefix}/${n}`), WithDecryption: true })
  );
  if (res.InvalidParameters?.length) throw new Error(`Missing SSM parameters: ${res.InvalidParameters.join(", ")}`);
  for (const p of res.Parameters || []) process.env[p.Name.split("/").pop()] = p.Value;
}

async function init() {
  await loadSecrets(); // must run BEFORE config/env.js is imported
  const [{ default: mongoose }, { config, validateEnv }, { createApp }, { initRag }, { runAssessmentJob }, { logger }] = await Promise.all([
    import("mongoose"),
    import("./config/env.js"),
    import("./app.js"),
    import("./ai/ragService.js"),
    import("./services/assessmentJob.js"),
    import("./utils/logger.js"),
  ]);
  validateEnv();

  const ensureDb = async () => {
    if (mongoose.connection.readyState !== 1) {
      await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 8000, maxPoolSize: 5 });
      logger.info("mongo_connected");
    }
  };
  await ensureDb();
  await initRag().catch((err) => logger.error("rag_init_failed", { err: err.message }));

  return { ensureDb, runAssessmentJob, expressHandler: serverless(createApp()) };
}

export async function handler(event, context) {
  context.callbackWaitsForEmptyEventLoop = false; // do not wait for the open Mongo connection
  if (!ready) {
    ready = init().catch((err) => {
      ready = null; // retry on the next invocation
      console.error(JSON.stringify({ level: "error", msg: "lambda_init_failed", err: err.message }));
      throw err;
    });
  }
  const app = await ready;
  await app.ensureDb();
  if (event?.task === "assess") {
    await app.runAssessmentJob(event); // background job started by startAssessmentJob()
    return { ok: true };
  }
  return app.expressHandler(event, context);
}
