// Usage:  npm run seed            -> 2 users + 5 demo claims
//         npm run seed -- --bulk=500   -> also adds 500 random claims (performance check)
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { config, validateEnv } from "./config/env.js";
import { User } from "./models/User.js";
import { Claim } from "./models/Claim.js";

const daysAgo = (n) => new Date(Date.now() - n * 86400000);
const doc = (docType, name) => ({ originalName: name, docType, uploadedBy: "Seed data", mimeType: "application/pdf", size: 120000 });

const demoClaims = [
  { // Missing FIR + repair estimate -> NEEDS_MORE_INFORMATION
    claimNumber: "CLM-1001", policyNumber: "POL-MOT-77001", customerName: "Arjun Mehta", claimType: "MOTOR",
    status: "UNDER_REVIEW", priority: "HIGH", incidentDate: daysAgo(6), claimedAmount: 250000,
    incidentDescription: "Vehicle accident: the insured car collided with a divider on the highway at night. Front bumper, bonnet and radiator damaged. No injuries reported.",
    supportingDocuments: [doc("DRIVING_LICENSE", "license-arjun.pdf"), doc("POLICY_COPY", "policy-mot-77001.pdf")],
  },
  { // Everything present, within limit -> LIKELY_COVERED
    claimNumber: "CLM-1002", policyNumber: "POL-HLT-33102", customerName: "Priya Nair", claimType: "HEALTH",
    status: "UNDER_REVIEW", priority: "MEDIUM", incidentDate: daysAgo(14), claimedAmount: 120000,
    incidentDescription: "Emergency hospitalisation for 3 days for an appendectomy (acute appendicitis). Treated at a registered hospital; discharged in stable condition.",
    supportingDocuments: [doc("HOSPITAL_BILL", "bill.pdf"), doc("DISCHARGE_SUMMARY", "discharge.pdf"), doc("MEDICAL_REPORT", "report.pdf"), doc("ID_PROOF", "id.pdf"), doc("POLICY_COPY", "policy-hlt-33102.pdf")],
  },
  { // Voluntary cancellation -> LIKELY_NOT_COVERED (exclusion TRV-4)
    claimNumber: "CLM-1003", policyNumber: "POL-TRV-55210", customerName: "Rahul Sharma", claimType: "TRAVEL",
    status: "NEW", priority: "LOW", incidentDate: daysAgo(3), claimedAmount: 45000,
    incidentDescription: "Cancelled a holiday trip to Singapore because I changed my plans and no longer wished to travel. Requesting refund of prepaid flights and hotel.",
    supportingDocuments: [doc("TICKET_COPY", "tickets.pdf"), doc("BOOKING_INVOICE", "invoice.pdf"), doc("POLICY_COPY", "policy-trv-55210.pdf")],
  },
  { // Complete docs but exceeds policy limit -> NEEDS_MANUAL_REVIEW
    claimNumber: "CLM-1004", policyNumber: "POL-PRP-90417", customerName: "Sneha Iyer", claimType: "PROPERTY",
    status: "ADDITIONAL_INFO_REQUIRED", priority: "HIGH", incidentDate: daysAgo(10), claimedAmount: 1200000,
    incidentDescription: "Fire in the kitchen spread to the living room, causing major damage to fixtures, wiring, furniture and electronics. Fire brigade attended the same day.",
    supportingDocuments: [doc("POLICY_COPY", "policy-prp-90417.pdf"), doc("DAMAGE_PHOTOS", "photos.pdf"), doc("REPAIR_ESTIMATE", "estimate.pdf"), doc("SURVEYOR_REPORT", "surveyor.pdf")],
  },
  { // Alcohol exclusion -> LIKELY_NOT_COVERED
    claimNumber: "CLM-1005", policyNumber: "POL-MOT-77544", customerName: "Karan Verma", claimType: "MOTOR",
    status: "NEW", priority: "MEDIUM", incidentDate: daysAgo(2), claimedAmount: 75000,
    incidentDescription: "Car hit a roadside tree late at night. Police noted the driver was under the influence of alcohol at the time of the accident.",
    supportingDocuments: [doc("FIR_COPY", "fir.pdf"), doc("REPAIR_ESTIMATE", "estimate.pdf"), doc("DRIVING_LICENSE", "license.pdf"), doc("POLICY_COPY", "policy.pdf")],
  },
];

function bulkClaims(n) {
  const types = ["HEALTH", "MOTOR", "TRAVEL", "PROPERTY"], statuses = ["NEW", "UNDER_REVIEW", "ADDITIONAL_INFO_REQUIRED", "APPROVED", "REJECTED", "SETTLEMENT_IN_PROGRESS", "CLOSED"], prios = ["LOW", "MEDIUM", "HIGH"];
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  return Array.from({ length: n }, (_, i) => ({
    claimNumber: `CLM-${2000 + i}`, policyNumber: `POL-BULK-${10000 + i}`, customerName: `Test Customer ${i + 1}`,
    claimType: pick(types), status: pick(statuses), priority: pick(prios), incidentDate: daysAgo(1 + (i % 120)),
    claimedAmount: 5000 + Math.floor(Math.random() * 900000), incidentDescription: "Bulk test claim generated for performance testing.",
  }));
}

async function run() {
  validateEnv();
  await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 8000 });
  await Promise.all([User.deleteMany({}), Claim.deleteMany({})]);

  await User.create([
    { name: "Anita Officer", email: "officer@securesure.com", passwordHash: await bcrypt.hash("Officer@123", 10), role: "OFFICER" },
    { name: "Manoj Manager", email: "manager@securesure.com", passwordHash: await bcrypt.hash("Manager@123", 10), role: "MANAGER" },
  ]);
  await Claim.insertMany(demoClaims);

  const bulkArg = process.argv.find((a) => a.startsWith("--bulk="));
  if (bulkArg) await Claim.insertMany(bulkClaims(Number(bulkArg.split("=")[1]) || 500));

  console.log(`Seeded users + ${demoClaims.length} demo claims${bulkArg ? " + bulk claims" : ""}.`);
  console.log("Login: officer@securesure.com / Officer@123   (or manager@securesure.com / Manager@123)");
  await mongoose.disconnect();
}
run().catch((e) => { console.error("Seed failed:", e.message); process.exit(1); });
