import { AppError } from "../utils/AppError.js";
import { logger } from "../utils/logger.js";

export function notFound(req, _res, next) {
  next(new AppError(404, "NOT_FOUND", `Route not found: ${req.method} ${req.path}`));
}

// Centralized error handler: never leaks stack traces or internals.
export function errorHandler(err, req, res, _next) {
  let status = 500, code = "INTERNAL_ERROR", message = "Internal server error";

  if (err instanceof AppError) ({ status, code, message } = err);
  else if (err.name === "MulterError") {
    status = 400; code = "UPLOAD_ERROR";
    message = err.code === "LIMIT_FILE_SIZE" ? "File too large (max 5 MB)" : "Invalid upload";
  } else if (err.type === "entity.parse.failed") {
    status = 400; code = "BAD_JSON"; message = "Malformed JSON body";
  } else if (err.name === "CastError" || err.name === "ValidationError") {
    status = 400; code = "VALIDATION_ERROR"; message = "Invalid input";
  } else if (/^Mongo/.test(err.name || "")) {
    code = "DATABASE_ERROR"; message = "Database error. Please try again.";
  }

  if (status >= 500) logger.error("request_failed", { method: req.method, path: req.path, code, err: err.message });
  res.status(status).json({ error: { code, message } });
}

export function requestLogger(req, res, next) {
  const start = Date.now();
  res.on("finish", () => {
    if (req.path === "/health") return;
    logger.info("http_request", { method: req.method, path: req.originalUrl.split("?")[0], status: res.statusCode, ms: Date.now() - start });
  });
  next();
}
