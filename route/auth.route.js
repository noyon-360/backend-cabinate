import express from "express";
import {
  register,
  verifyEmail,
  resendOTP,
  login,
  refreshToken,
  forgotPassword,
  verifyResetOTP,
  resetPassword,
  logout,
} from "../controller/auth.controller.js";
import { protect } from "../middleware/auth.middleware.js";

const router = express.Router();

// Public routes
router.post("/register", register);
router.post("/verify-email", verifyEmail);
router.post("/resend-otp", resendOTP);
router.post("/login", login);
router.post("/refresh-token", refreshToken);
router.post("/forgot-password", forgotPassword);
router.post("/verify-reset-otp", verifyResetOTP);
router.post("/reset-password", resetPassword);

// Protected
router.post("/logout", protect, logout);

export default router;
