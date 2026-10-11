import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import { config } from "../config/env.js";
import { logger } from "../utils/logger.js";

let io = null;

export function initSocket(httpServer) {
  io = new Server(httpServer, { cors: { origin: config.corsOrigin } });

  // Same JWT as the REST API; unauthenticated sockets are refused.
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error("AUTH_REQUIRED"));
      socket.user = jwt.verify(token, config.jwtSecret);
      next();
    } catch {
      logger.warn("socket_auth_failed");
      next(new Error("AUTH_INVALID"));
    }
  });
  io.on("connection", (socket) => {
    logger.info("socket_connected", { userId: socket.user.sub });
    socket.on("disconnect", () => logger.info("socket_disconnected", { userId: socket.user.sub }));
  });
  return io;
}

// Broadcast to ALL connected clients (workbook: "Connected Clients receive notification").
export function broadcastStatusChange(payload) {
  if (io) io.emit("claimStatusUpdated", payload);
}
