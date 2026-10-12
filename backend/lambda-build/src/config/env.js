import "dotenv/config";

const env = process.env;

function pickProvider() {
  if (env.LLM_PROVIDER) return env.LLM_PROVIDER.toLowerCase();
  if (env.ANTHROPIC_API_KEY) return "anthropic";
  if (env.OPENAI_API_KEY) return "openai";
  return "mock";
}
const provider = pickProvider();
const defaultModels = { anthropic: "claude-haiku-4-5-20251001", openai: "gpt-4o-mini", mock: "mock-offline" };

export const config = {
  port: Number(env.PORT || 5000),
  nodeEnv: env.NODE_ENV || "development",
  mongoUri: env.MONGODB_URI,
  jwtSecret: env.JWT_SECRET,
  jwtExpiresIn: env.JWT_EXPIRES_IN || "8h",
  corsOrigin: (env.CORS_ORIGIN || "http://localhost:5173").split(",").map((s) => s.trim()),
  aws: { region: env.AWS_REGION || "ap-south-1", bucket: env.S3_BUCKET || "", endpoint: env.S3_ENDPOINT || "" },
  ai: {
    provider,
    model: env.LLM_MODEL || defaultModels[provider] || "unknown",
    anthropicKey: env.ANTHROPIC_API_KEY,
    openaiKey: env.OPENAI_API_KEY,
    timeoutMs: Number(env.LLM_TIMEOUT_MS || 30000),
    embeddings: (env.EMBEDDINGS_PROVIDER || "local").toLowerCase(),
    baseUrl: env.LLM_BASE_URL,
    compatKey: env.LLM_API_KEY,
  },
  allowFailureSim: env.ALLOW_FAILURE_SIMULATION === "true" || (env.NODE_ENV || "development") !== "production",
};

export function validateEnv() {
  const missing = ["MONGODB_URI", "JWT_SECRET"].filter((k) => !env[k]);
  if (missing.length) throw new Error(`Missing required environment variables: ${missing.join(", ")}. Copy .env.example to .env first.`);
}
