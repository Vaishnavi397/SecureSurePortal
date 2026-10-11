export const DOC_TYPES = [
  "POLICY_COPY", "FIR_COPY", "REPAIR_ESTIMATE", "DRIVING_LICENSE", "HOSPITAL_BILL", "DISCHARGE_SUMMARY",
  "MEDICAL_REPORT", "ID_PROOF", "TICKET_COPY", "BOOKING_INVOICE", "CANCELLATION_PROOF", "DAMAGE_PHOTOS",
  "SURVEYOR_REPORT", "OTHER",
];
export const CLAIM_TYPES = ["HEALTH", "MOTOR", "TRAVEL", "PROPERTY"];
export const PRIORITIES = ["LOW", "MEDIUM", "HIGH"];
export const STATUSES = ["NEW", "UNDER_REVIEW", "ADDITIONAL_INFO_REQUIRED", "APPROVED", "REJECTED", "SETTLEMENT_IN_PROGRESS", "CLOSED"];

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
export const money = (n) => inr.format(n ?? 0);
export const date = (d) => (d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "-");
export const dateTime = (d) => (d ? new Date(d).toLocaleString("en-IN") : "-");
export const label = (s) => (s || "").replace(/_/g, " ");
