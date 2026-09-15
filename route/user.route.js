import express from "express";
import {
  getProfile,
  updateProfile,
  changePassword,
  updateNotifications,
  deleteAccount,
} from "../controller/user.controller.js";
import { protect } from "../middleware/auth.middleware.js";
import upload from "../middleware/multer.middleware.js";

const router = express.Router();

// All routes require auth
router.use(protect);

router.get("/profile", getProfile);
router.patch("/profile", upload.single("profileImage"), updateProfile);
router.patch("/change-password", changePassword);
router.patch("/notifications", updateNotifications);
router.delete("/delete-account", deleteAccount);

export default router;
