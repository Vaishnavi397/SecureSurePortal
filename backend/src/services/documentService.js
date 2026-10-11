import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { config } from "../config/env.js";
import { AppError } from "../utils/AppError.js";
import { logger } from "../utils/logger.js";

let client;
function getClient() {
  if (!config.aws.bucket) throw new AppError(503, "S3_NOT_CONFIGURED", "Document storage (S3) is not configured on the server");
  if (!client) {
    client = new S3Client({
      region: config.aws.region,
      ...(config.aws.endpoint ? { endpoint: config.aws.endpoint, forcePathStyle: true } : {}),
    }); // credentials: standard AWS provider chain (env vars / profile / ECS task role)
  }
  return client;
}

// Check the real file signature, not just the client-supplied mime type.
function matchesSignature(buf, mime) {
  if (mime === "application/pdf") return buf.subarray(0, 4).toString() === "%PDF";
  if (mime === "image/png") return buf.subarray(1, 4).toString() === "PNG";
  if (mime === "image/jpeg") return buf[0] === 0xff && buf[1] === 0xd8;
  return false;
}

export async function uploadToS3({ claimNumber, file, simulate }) {
  if (!matchesSignature(file.buffer, file.mimetype)) throw new AppError(400, "INVALID_FILE_CONTENT", "File content does not match its type");
  const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);
  const key = `claims/${claimNumber}/${Date.now()}-${safeName}`;
  try {
    if (simulate === "s3") throw new Error("Simulated S3 failure");
    await getClient().send(
      new PutObjectCommand({
        Bucket: config.aws.bucket, Key: key, Body: file.buffer,
        ContentType: file.mimetype, ServerSideEncryption: "AES256",
      })
    );
    return { key, safeName };
  } catch (err) {
    if (err instanceof AppError) throw err;
    logger.error("s3_upload_failed", { claimNumber, errName: err.name, err: err.message });
    throw new AppError(502, "S3_UPLOAD_FAILED", "Could not store the document right now. Please try again.");
  }
}

export async function getDownloadUrl(key) {
  try {
    return await getSignedUrl(getClient(), new GetObjectCommand({ Bucket: config.aws.bucket, Key: key }), { expiresIn: 300 });
  } catch (err) {
    if (err instanceof AppError) throw err;
    logger.error("s3_url_failed", { errName: err.name });
    throw new AppError(502, "S3_URL_FAILED", "Could not create a download link");
  }
}
