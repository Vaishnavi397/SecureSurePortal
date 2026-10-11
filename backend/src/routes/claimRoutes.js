import { Router } from "express";
import { asyncHandler as h } from "../utils/asyncHandler.js";
import { upload } from "../middleware/upload.js";
import * as c from "../controllers/claimController.js";

const router = Router(); // mounted at /api/claims behind requireAuth
router.get("/", h(c.listClaims));
router.get("/:id", h(c.getClaim));
router.patch("/:id/status", h(c.updateStatus));
router.post("/:id/documents", upload.single("file"), h(c.uploadDocument));
router.get("/:id/documents/:docId/url", h(c.getDocumentUrl));
router.post("/:id/generate-assessment", h(c.generateAssessment));
export default router;
