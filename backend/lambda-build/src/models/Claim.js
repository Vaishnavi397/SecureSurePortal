import mongoose from "mongoose";
import { CLAIM_TYPES, PRIORITIES, STATUSES, DOC_TYPES } from "../utils/constants.js";

const documentSchema = new mongoose.Schema({
  originalName: String,
  docType: { type: String, enum: DOC_TYPES, default: "OTHER" },
  s3Key: String, // empty for seeded demo records
  mimeType: String,
  size: Number,
  uploadedBy: String,
  uploadedAt: { type: Date, default: Date.now },
});

const historySchema = new mongoose.Schema(
  { from: String, to: String, by: String, note: String, at: { type: Date, default: Date.now } },
  { _id: false }
);

const claimSchema = new mongoose.Schema(
  {
    claimNumber: { type: String, required: true, unique: true },
    policyNumber: { type: String, required: true },
    customerName: { type: String, required: true },
    claimType: { type: String, enum: CLAIM_TYPES, required: true, index: true },
    status: { type: String, enum: STATUSES, default: "NEW", index: true },
    priority: { type: String, enum: PRIORITIES, default: "MEDIUM", index: true },
    incidentDate: { type: Date, required: true },
    incidentDescription: { type: String, required: true },
    claimedAmount: { type: Number, required: true, min: 0 },
    supportingDocuments: [documentSchema],
    assessmentSummary: String,
    assessment: mongoose.Schema.Types.Mixed, // full structured AI assessment
    assessmentGeneratedAt: Date,
    statusHistory: [historySchema],
  },
  {
    timestamps: true,
    toJSON: {
      versionKey: false,
      // Only the top-level claim gets `id` (sub-documents keep their own _id).
      transform: (_doc, ret) => {
        if (ret.claimNumber) {
          ret.id = String(ret._id);
          delete ret._id;
        }
        return ret;
      },
    },
  }
);

export const Claim = mongoose.model("Claim", claimSchema);
