// Claim lifecycle (workbook "Claim Lifecycle"). Simplification: the workbook lists the
// sequence only, so REJECTED -> CLOSED is our reasonable reading for rejected claims.
export const TRANSITIONS = {
  NEW: ["UNDER_REVIEW"],
  UNDER_REVIEW: ["ADDITIONAL_INFO_REQUIRED", "APPROVED", "REJECTED"],
  ADDITIONAL_INFO_REQUIRED: ["UNDER_REVIEW"],
  APPROVED: ["SETTLEMENT_IN_PROGRESS"],
  REJECTED: ["CLOSED"],
  SETTLEMENT_IN_PROGRESS: ["CLOSED"],
  CLOSED: [],
};
export const allowedTransitions = (status) => TRANSITIONS[status] || [];
export const canTransition = (from, to) => allowedTransitions(from).includes(to);
