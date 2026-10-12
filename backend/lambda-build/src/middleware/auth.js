import jwt from "jsonwebtoken";
import { config } from "../config/env.js";
import { AppError } from "../utils/AppError.js";
import { logger } from "../utils/logger.js";

export function requireAuth(req, _res, next) {
  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) {
    logger.warn("auth_missing_token", { path: req.originalUrl.split("?")[0] });
    return next(new AppError(401, "AUTH_REQUIRED", "Authentication required"));
  }
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    req.user = { id: payload.sub, email: payload.email, name: payload.name, role: payload.role };
    next();
  } catch (err) {
    logger.warn("auth_invalid_token", { path: req.originalUrl.split("?")[0], reason: err.name });
    const msg = err.name === "TokenExpiredError" ? "Token expired" : "Invalid token";
    next(new AppError(401, "AUTH_INVALID", msg));
  }
}
