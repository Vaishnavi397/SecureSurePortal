// Background AI assessment for AWS Lambda.
// API Gateway (HTTP API) cuts requests off after 30 s, but an LLM call can take longer.
// So in Lambda mode (AI_ASYNC=true) the API call returns 202 immediately and the Lambda
// invokes ITSELF asynchronously to do the work. The result is saved on the claim in MongoDB
// and the browser polls GET /api/claims/:id until assessmentStatus is DONE or FAILED.
import { Claim } from "../models/Claim.js";
import { AppError } from "../utils/AppError.js";
import { logger } from "../utils/logger.js";
import { assessClaim } from "../ai/aiService.js";

export function applyAssessment(claim, assessment) {
  claim.assessment = assessment;
  claim.assessmentSummary = `[${assessment.recommendation}] ${assessment.summary}`;
  claim.assessmentGeneratedAt = new Date();
  claim.assessmentStatus = "DONE";
  claim.assessmentError = undefined;
  claim.markModified("assessment");
}

export async function startAssessmentJob(claim, simulate) {
  claim.assessmentStatus = "RUNNING";
  claim.assessmentError = undefined;
  await claim.save();
  try {
    const { LambdaClient, InvokeCommand } = await import("@aws-sdk/client-lambda");
    await new LambdaClient({}).send(
      new InvokeCommand({
        FunctionName: process.env.AWS_LAMBDA_FUNCTION_NAME,
        InvocationType: "Event", // fire-and-forget
        Payload: Buffer.from(JSON.stringify({ task: "assess", claimId: claim.id, simulate })),
      })
    );
  } catch (err) {
    logger.error("assessment_job_start_failed", { errName: err.name, err: err.message });
    claim.assessmentStatus = "FAILED";
    claim.assessmentError = "Could not start the AI assessment. Please try again.";
    await claim.save();
    throw new AppError(502, "ASSESSMENT_START_FAILED", claim.assessmentError);
  }
}

export async function runAssessmentJob({ claimId, simulate }) {
  const claim = await Claim.findById(claimId);
  if (!claim) return;
  try {
    const assessment = await assessClaim(claim, { simulate });
    applyAssessment(claim, assessment);
    await claim.save();
    logger.info("assessment_generated", { claimNumber: claim.claimNumber, recommendation: assessment.recommendation, provider: assessment.model.provider });
  } catch (err) {
    logger.error("assessment_job_failed", { claimNumber: claim.claimNumber, code: err.code || "UNKNOWN" });
    claim.assessmentStatus = "FAILED";
    claim.assessmentError = err instanceof AppError ? err.message : "Assessment failed unexpectedly. Please try again.";
    await claim.save();
  }
}
