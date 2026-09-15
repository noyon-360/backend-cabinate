import jwt from "jsonwebtoken";
import httpStatus from "http-status";
import AppError from "../errors/AppError.js";
import User from "../model/user.model.js";
import catchAsync from "../utils/catchAsync.js";

// Protect any route — verifies JWT and attaches user to req
export const protect = catchAsync(async (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];

  if (!token) {
    throw new AppError(httpStatus.UNAUTHORIZED, "Token not found");
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
  } catch (error) {
    throw new AppError(httpStatus.UNAUTHORIZED, "Invalid or expired token");
  }

  const user = await User.findById(decoded._id);
  if (!user) {
    throw new AppError(httpStatus.UNAUTHORIZED, "User not found");
  }

  if (user.isSuspended) {
    throw new AppError(httpStatus.FORBIDDEN, "Your account has been suspended");
  }

  if (!user.isEmailVerified) {
    throw new AppError(httpStatus.FORBIDDEN, "Email not verified");
  }

  req.user = user;
  next();
});

// Only admin (owner) can access
export const isOwner = catchAsync(async (req, res, next) => {
  if (req.user?.role !== "owner") {
    throw new AppError(httpStatus.FORBIDDEN, "Access denied. Owner only.");
  }
  next();
});

// Only staff can access
export const isStaff = catchAsync(async (req, res, next) => {
  if (req.user?.role !== "staff") {
    throw new AppError(httpStatus.FORBIDDEN, "Access denied. Staff only.");
  }
  next();
});

// Both owner and staff can access
export const isOwnerOrStaff = catchAsync(async (req, res, next) => {
  if (!["owner", "staff"].includes(req.user?.role)) {
    throw new AppError(httpStatus.FORBIDDEN, "Access denied.");
  }
  next();
});
