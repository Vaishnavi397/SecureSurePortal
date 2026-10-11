import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { User } from "../models/User.js";
import { config } from "../config/env.js";
import { AppError } from "../utils/AppError.js";
import { logger } from "../utils/logger.js";

export async function login(req, res) {
  const { email, password } = req.body || {};
  if (typeof email !== "string" || typeof password !== "string" || !email || !password)
    throw new AppError(400, "VALIDATION_ERROR", "Email and password are required");

  const user = await User.findOne({ email: email.toLowerCase().trim() });
  const ok = user && (await bcrypt.compare(password, user.passwordHash));
  if (!ok) {
    logger.warn("login_failed"); // no email/password in logs
    throw new AppError(401, "INVALID_CREDENTIALS", "Invalid email or password");
  }
  const token = jwt.sign(
    { sub: user.id, email: user.email, name: user.name, role: user.role },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn }
  );
  logger.info("login_success", { userId: user.id });
  res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
}
