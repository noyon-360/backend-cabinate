import express from "express";
import {
  submitContactUs,
  getAllSupportMessages,
  markResolved,
} from "../controller/support.controller.js";
import { protect, isOwner } from "../middleware/auth.middleware.js";

const router = express.Router();

router.use(protect);

// Any logged-in user can submit
router.post("/", submitContactUs);

// Owner only — view/manage support messages
router.get("/", isOwner, getAllSupportMessages);
router.patch("/:id/resolve", isOwner, markResolved);

export default router;
