import multer from "multer";
import { AppError } from "../utils/AppError.js";

const ALLOWED = ["application/pdf", "image/png", "image/jpeg"];

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED.includes(file.mimetype)) return cb(new AppError(400, "INVALID_FILE_TYPE", "Only PDF, PNG or JPEG files are allowed"));
    cb(null, true);
  },
});
