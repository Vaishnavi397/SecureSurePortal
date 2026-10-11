import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { searchPolicies } from "../controllers/policyController.js";

const router = Router(); // mounted at /api/policies behind requireAuth
router.get("/search", asyncHandler(searchPolicies));
export default router;
