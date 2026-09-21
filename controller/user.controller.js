import User from "../model/user.model.js";
import AppError from "../errors/AppError.js";
import catchAsync from "../utils/catchAsync.js";
import httpStatus from "http-status";
import sendResponse from "../utils/sendResponse.js";
import { uploadOnCloudinary, deleteFromCloudinary } from "../utils/commonMethod.js";

// ─── GET PROFILE ─────────────────────────────────────────────────────────────
export const getProfile = catchAsync(async (req, res) => {
  const user = await User.findById(req.user._id).select(
    "-password -otp -resetPasswordOtp -refreshToken"
  );

  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "User not found");
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Profile fetched successfully",
    data: user,
  });
});

// ─── SETUP / UPDATE PROFILE ───────────────────────────────────────────────────
// Used for: Screen 6 (Profile Setup) and Screen 22 (Edit Profile)
export const updateProfile = catchAsync(async (req, res) => {
  const { fullName, phoneNumber, address } = req.body;
  const user = await User.findById(req.user._id);


  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "User not found");
  }

  if (typeof fullName === 'string') {
    const nameParts = fullName.trim().split(/\s+/).filter(Boolean);
    user.firstName = nameParts[0] || "";
    user.lastName = nameParts.slice(1).join(" ") || "";
  }

  if (phoneNumber !== undefined) user.phoneNumber = phoneNumber.trim();
  if (address !== undefined) user.address = address.trim();

  // Handle profile image upload
  if (req.file) {
    // Delete old image from Cloudinary
    if (user.profileImage?.public_id) {
      await deleteFromCloudinary(user.profileImage.public_id);
    }
    const upload = await uploadOnCloudinary(req.file.buffer, {
      folder: "snapndesign/profiles",
    });
    user.profileImage = {
      public_id: upload.public_id,
      url: upload.secure_url,
    };
  }

  await user.save();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Profile updated successfully",
    data: {
      _id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phoneNumber: user.phoneNumber,
      address: user.address,
      profileImage: user.profileImage,
      role: user.role,
    },
  });
});

// ─── CHANGE PASSWORD (from Settings > General Settings) ───────────────────────
export const changePassword = catchAsync(async (req, res) => {
  const { currentPassword, newPassword, confirmPassword } = req.body;

  if (!currentPassword || !newPassword || !confirmPassword) {
    throw new AppError(httpStatus.BAD_REQUEST, "All fields are required");
  }
  
  if(currentPassword === newPassword) {
    throw new AppError(httpStatus.BAD_REQUEST, "New password must be different from current password");
  }


  if (newPassword !== confirmPassword) {
    throw new AppError(httpStatus.BAD_REQUEST, "Passwords do not match");
  }

  if (newPassword.length < 6) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "New password must be at least 6 characters"
    );
  }

  const user = await User.findById(req.user._id).select("+password");
  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "User not found");
  }

  const match = await user.comparePassword(currentPassword);
  if (!match) {
    throw new AppError(httpStatus.BAD_REQUEST, "Current password is incorrect");
  }

  user.password = newPassword;
  await user.save();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Password changed successfully",
    data: null,
  });
});

// ─── UPDATE NOTIFICATION SETTINGS (Screen 25) ────────────────────────────────
export const updateNotifications = catchAsync(async (req, res) => {
  const { push, loan, transaction, fund, support } = req.body;

  const user = await User.findById(req.user._id);
  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "User not found");
  }

  if (typeof push === "boolean") user.notifications.push = push;
  if (typeof loan === "boolean") user.notifications.loan = loan;
  if (typeof transaction === "boolean") user.notifications.transaction = transaction;
  if (typeof fund === "boolean") user.notifications.fund = fund;
  if (typeof support === "boolean") user.notifications.support = support;

  await user.save();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Notification settings updated",
    data: user.notifications,
  });
});

// ─── DELETE ACCOUNT (Screen 27) ───────────────────────────────────────────────
export const deleteAccount = catchAsync(async (req, res) => {
  const { reason } = req.body;
  const userId = req.user._id;

  // Delete profile image from Cloudinary
  const user = await User.findById(userId);
  if (user?.profileImage?.public_id) {
    await deleteFromCloudinary(user.profileImage.public_id);
  }

  await User.findByIdAndDelete(userId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Account deleted successfully",
    data: { reason: reason || "Not specified" },
  });
});
