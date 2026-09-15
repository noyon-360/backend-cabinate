import express from "express";
import {
  addStaff,
  getAllStaff,
  getSingleStaff,
  toggleStaffStatus,
  updateStaff,
  deleteStaff,
  getStaffStats,
} from "../controller/staff.controller.js";
import { protect, isOwner } from "../middleware/auth.middleware.js";
import upload from "../middleware/multer.middleware.js";

const router = express.Router();

// All staff routes — owner only
router.use(protect, isOwner);

router.get("/", getAllStaff);
router.get("/stats", getStaffStats);
router.post("/", upload.single("profileImage"), addStaff);
router.get("/:id", getSingleStaff);
router.patch("/:id", upload.single("profileImage"), updateStaff);
router.patch("/:id/toggle-status", toggleStaffStatus);
router.delete("/:id", deleteStaff);

export default router;
