import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import { config } from "./config/env.js";
import { requireAuth } from "./middleware/auth.js";
import { notFound, errorHandler, requestLogger } from "./middleware/errorHandler.js";
import authRoutes from "./routes/authRoutes.js";
import claimRoutes from "./routes/claimRoutes.js";
import policyRoutes from "./routes/policyRoutes.js";
import { ragStatus } from "./ai/ragService.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const app = express();
  app.set("trust proxy", 1);
  app.use(cors({ origin: config.corsOrigin }));
  app.use(express.json({ limit: "100kb" }));
  app.use(requestLogger);

  // FR10 - public health check (used by load balancer / demo)
  app.get("/health", (_req, res) => {
    const mongo = mongoose.connection.readyState === 1 ? "connected" : "disconnected";
    res.status(mongo === "connected" ? 200 : 503).json({
      status: mongo === "connected" ? "ok" : "degraded",
      mongo, rag: ragStatus(), llmProvider: config.ai.provider,
      uptimeSeconds: Math.round(process.uptime()), timestamp: new Date().toISOString(),
    });
  });

  app.use("/auth", authRoutes);
  app.use("/api/claims", requireAuth, claimRoutes);
  app.use("/api/policies", requireAuth, policyRoutes);

  // In Docker/production the built React app is copied to backend/public and served here.
  const publicDir = path.resolve(__dirname, "../public");
  if (fs.existsSync(publicDir)) {
    app.use(express.static(publicDir));
    app.get(/^\/(?!api|auth|health|socket\.io).*/, (_req, res) => res.sendFile(path.join(publicDir, "index.html")));
  }

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
