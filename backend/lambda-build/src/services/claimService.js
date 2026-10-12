import { Claim } from "../models/Claim.js";
import { AppError } from "../utils/AppError.js";
import { allowedTransitions } from "./claimWorkflow.js";

// Accepts a Mongo id (24 hex chars) or a claim number such as CLM-1001.
export async function findClaimOrThrow(idOrNumber) {
  let claim;
  if (/^[0-9a-fA-F]{24}$/.test(idOrNumber)) claim = await Claim.findById(idOrNumber);
  else if (/^CLM-\d+$/i.test(idOrNumber)) claim = await Claim.findOne({ claimNumber: idOrNumber.toUpperCase() });
  else throw new AppError(400, "INVALID_CLAIM_ID", "Invalid claim id");
  if (!claim) throw new AppError(404, "CLAIM_NOT_FOUND", "Claim not found");
  return claim;
}

export function toClaimResponse(claim) {
  const json = claim.toJSON();
  return { claim: json, allowedTransitions: allowedTransitions(claim.status) };
}
