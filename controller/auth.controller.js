import User from "../model/user.model.js";
import AppError from "../errors/AppError.js";
import catchAsync from "../utils/catchAsync.js";
import httpStatus from "http-status";
import sendResponse from "../utils/sendResponse.js";
import { createToken, verifyToken } from "../utils/authToken.js";
import { generateOTP } from "../utils/commonMethod.js";
import { sendEmail, otpEmailTemplate } from "../utils/sendEmail.js";

// ─── REGISTER ───────────────────────────────────────────────────────────────
export const register = catchAsync(async (req, res) => {
  const {email, password, confirmPassword } = req.body;

  if (!email || !password || !confirmPassword) {
    throw new AppError(httpStatus.BAD_REQUEST, "All fields are required");
  }

  if (password !== confirmPassword) {
    throw new AppError(httpStatus.BAD_REQUEST, "Passwords do not match");
  }

  if (password.length < 6) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Password must be at least 6 characters"
    );
  }

  const exists = await User.findOne({ email: email.toLowerCase().trim() });
  if (exists) {
    throw new AppError(httpStatus.BAD_REQUEST, "Email already registered");
  }

  const user = await User.create({
    email: email.toLowerCase().trim(),
    password,
    role: "owner",
  });

  const otp = generateOTP();
  user.setOTP(otp);
  await user.save();

  await sendEmail(
    user.email,
    "Verify your SnapNDesign account",
    otpEmailTemplate(otp, "email verification")
  );

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Registered successfully. Check your email for the OTP.",
    data: {
      email: user.email,
      // otp, // dev only — remove in production
    },
  });
});

// ─── VERIFY EMAIL ────────────────────────────────────────────────────────────
export const verifyEmail = catchAsync(async (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    throw new AppError(httpStatus.BAD_REQUEST, "Email and OTP are required");
  }

  const user = await User.findOne({ email: email.toLowerCase().trim() });
  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "User not found");
  }

  if (!user.isOTPValid(otp)) {
    throw new AppError(httpStatus.BAD_REQUEST, "Invalid or expired OTP");
  }

  user.isEmailVerified = true;
  user.clearOTP();

  const payload = { _id: user._id, email: user.email, role: user.role };

  const accessToken = createToken(
    payload,
    process.env.JWT_ACCESS_SECRET,
    process.env.JWT_ACCESS_EXPIRES_IN
  );
  const refreshToken = createToken(
    payload,
    process.env.JWT_REFRESH_SECRET,
    process.env.JWT_REFRESH_EXPIRES_IN
  );

  user.refreshToken = refreshToken;
  await user.save();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Email verified successfully",
    data: {
      _id: user._id,
      firstName: user.firstName ?? "",
      lastName: user.lastName ?? "",
      email: user.email,
      phoneNumber: user.phoneNumber,
      address: user.address,
      profileImage: user.profileImage,
      role: user.role,
      ownerId: user.ownerId,
      isEmailVerified: user.isEmailVerified,
      notifications: user.notifications,
      accessToken,
      refreshToken,
    },
  });
});

// ─── RESEND OTP ──────────────────────────────────────────────────────────────
export const resendOTP = catchAsync(async (req, res) => {
  const { email } = req.body;

  if (!email) {
    throw new AppError(httpStatus.BAD_REQUEST, "Email is required");
  }

  const user = await User.findOne({ email: email.toLowerCase().trim() });
  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "User not found");
  }

  if (user.isEmailVerified) {
    throw new AppError(httpStatus.BAD_REQUEST, "Email already verified");
  }

  const otp = generateOTP();
  user.setOTP(otp);
  await user.save();

  await sendEmail(
    user.email,
    "Your new OTP — SnapNDesign",
    otpEmailTemplate(otp, "email verification")
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "New OTP sent to your email",
    // data: { otp }, // dev only
  });
});

// ─── LOGIN ────────────────────────────────────────────────────────────────────
export const login = catchAsync(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    throw new AppError(httpStatus.BAD_REQUEST, "Email and password required");
  }

  const user = await User.findOne({
    email: email.toLowerCase().trim(),
  }).select("+password");

  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "User not found");
  }

  if (!user.isEmailVerified) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      "Email not verified. Please verify your email first." // This message is being used as a condition in the mobile app.
    );
  }

  if (user.isSuspended) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      "Your account has been suspended. Contact support."
    );
  }

  const match = await user.comparePassword(password);
  if (!match) {
    throw new AppError(httpStatus.FORBIDDEN, "Incorrect password");
  }

  const payload = { _id: user._id, email: user.email, role: user.role };

  const accessToken = createToken(
    payload,
    process.env.JWT_ACCESS_SECRET,
    process.env.JWT_ACCESS_EXPIRES_IN
  );
  const refreshToken = createToken(
    payload,
    process.env.JWT_REFRESH_SECRET,
    process.env.JWT_REFRESH_EXPIRES_IN
  );

  user.refreshToken = refreshToken;
  await user.save();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Login successful",
    data: {
      _id: user._id,
      firstName: user.firstName ?? '',
      lastName: user.lastName ?? '',
      email: user.email,
      phoneNumber: user.phoneNumber,
      address: user.address,
      profileImage: user.profileImage,
      role: user.role,
      ownerId: user.ownerId,
      isEmailVerified: user.isEmailVerified,
      notifications: user.notifications,
      accessToken,
      refreshToken,
    },
  });
});

// ─── REFRESH TOKEN ────────────────────────────────────────────────────────────
export const refreshToken = catchAsync(async (req, res) => {
  const { refreshToken: incomingRefreshToken } = req.body;

  if (!incomingRefreshToken) {
    throw new AppError(httpStatus.BAD_REQUEST, "Refresh token is required");
  }

  let decoded;
  try {
    decoded = verifyToken(incomingRefreshToken, process.env.JWT_REFRESH_SECRET);
  } catch (error) {
    throw new AppError(httpStatus.UNAUTHORIZED, "Invalid or expired refresh token");
  }

  const user = await User.findById(decoded._id);
  if (!user || user.refreshToken !== incomingRefreshToken) {
    throw new AppError(httpStatus.UNAUTHORIZED, "Invalid refresh token");
  }

  if (user.isSuspended) {
    throw new AppError(httpStatus.FORBIDDEN, "Your account has been suspended");
  }

  const payload = { _id: user._id, email: user.email, role: user.role };

  const accessToken = createToken(
    payload,
    process.env.JWT_ACCESS_SECRET,
    process.env.JWT_ACCESS_EXPIRES_IN
  );
  const newRefreshToken = createToken(
    payload,
    process.env.JWT_REFRESH_SECRET,
    process.env.JWT_REFRESH_EXPIRES_IN
  );

  user.refreshToken = newRefreshToken;
  await user.save();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Token refreshed successfully",
    data: {
      accessToken,
      refreshToken: newRefreshToken,
    },
  });
});

// ─── FORGOT PASSWORD ──────────────────────────────────────────────────────────
export const forgotPassword = catchAsync(async (req, res) => {
  const { email } = req.body;

  if (!email) {
    throw new AppError(httpStatus.BAD_REQUEST, "Email is required");
  }

  const user = await User.findOne({ email: email.toLowerCase().trim() });
  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "User not found");
  }

  const otp = generateOTP();
  user.setResetPasswordOTP(otp);
  await user.save();

  await sendEmail(
    user.email,
    "Reset your SnapNDesign password",
    otpEmailTemplate(otp, "password reset")
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "OTP sent to your email",
    data: { email: user.email},
  });
});

// ─── VERIFY RESET OTP ─────────────────────────────────────────────────────────
export const verifyResetOTP = catchAsync(async (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    throw new AppError(httpStatus.BAD_REQUEST, "Email and OTP are required");
  }

  const user = await User.findOne({ email: email.toLowerCase().trim() });
  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "User not found");
  }

  if (!user.isResetPasswordOTPValid(otp)) {
    throw new AppError(httpStatus.BAD_REQUEST, "Invalid or expired OTP");
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "OTP verified successfully",
    data: { email: user.email, resetOtpVerified: true },
  });
});

// ─── RESET PASSWORD ───────────────────────────────────────────────────────────
export const resetPassword = catchAsync(async (req, res) => {
  const { email, otp, password, confirmPassword } = req.body;

  if (!email || !otp || !password || !confirmPassword) {
    throw new AppError(httpStatus.BAD_REQUEST, "All fields are required");
  }

  if (password !== confirmPassword) {
    throw new AppError(httpStatus.BAD_REQUEST, "Passwords do not match");
  }

  if (password.length < 6) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Password must be at least 6 characters"
    );
  }

  const user = await User.findOne({
    email: email.toLowerCase().trim(),
  }).select("+password");

  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "User not found");
  }

  if (!user.isResetPasswordOTPValid(otp)) {
    throw new AppError(httpStatus.BAD_REQUEST, "Invalid or expired OTP");
  }

  user.password = password;
  user.clearResetPasswordOTP();
  await user.save();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Password reset successfully",
    data: null,
  });
});

// ─── LOGOUT ───────────────────────────────────────────────────────────────────
export const logout = catchAsync(async (req, res) => {
  const userId = req.user?._id;

  await User.findByIdAndUpdate(userId, { refreshToken: null });

  res.clearCookie("refreshToken");

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Logged out successfully",
    data: null,
  });
});
