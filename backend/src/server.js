import http from "http";
import mongoose from "mongoose";
import { config, validateEnv } from "./config/env.js";
import { createApp } from "./app.js";
import { initSocket } from "./sockets/socketService.js";
import { initRag } from "./ai/ragService.js";
import { logger } from "./utils/logger.js";

process.on("unhandledRejection", (reason) => logger.error("unhandled_rejection", { err: String(reason?.message || reason) }));
process.on("uncaughtException", (err) => logger.error("uncaught_exception", { err: err.message }));

async function start() {
  validateEnv();
  await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 8000 });
  logger.info("mongo_connected");

  const server = http.createServer(createApp());
  initSocket(server);

  // Build the policy vector index in the background; the API stays up even if this fails.
  initRag().catch((err) => logger.error("rag_init_failed", { err: err.message }));

  server.listen(config.port, "0.0.0.0", () =>
    logger.info("server_started", { port: config.port, env: config.nodeEnv, llmProvider: config.ai.provider, s3Configured: Boolean(config.aws.bucket) })
  );

  const shutdown = (sig) => {
    logger.info("shutdown", { sig });
    server.close(() => mongoose.disconnect().finally(() => process.exit(0)));
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

start().catch((err) => {
  logger.error("startup_failed", { err: err.message });
  process.exit(1);
});
