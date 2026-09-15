import User from "../model/user.model.js";
import Job from "../model/job.model.js";
import AppError from "../errors/AppError.js";
import catchAsync from "../utils/catchAsync.js";
import httpStatus from "http-status";
import sendResponse from "../utils/sendResponse.js";
import { uploadOnCloudinary, deleteFromCloudinary } from "../utils/commonMethod.js";
import { sendEmail, staffInviteTemplate } from "../utils/sendEmail.js";

// ─── ADD STAFF (Screen 36 — Add Staff modal) ──────────────────────────────────
export const addStaff = catchAsync(async (req, res) => {
  const { firstName, lastName, email, phoneNumber, password } = req.body;
  const ownerId = req.user._id;

  if (!firstName || !lastName || !email || !phoneNumber || !password) {
    throw new AppError(httpStatus.BAD_REQUEST, "All fields are required");
  }

  if (password.length < 6) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Password must be at least 6 characters"
    );
  }

  const exists = await User.findOne({ email: email.toLowerCase().trim() });
  if (exists) {
    throw new AppError(httpStatus.BAD_REQUEST, "Email already in use");
  }

  let profileImage = { public_id: "", url: "" };
  if (req.file) {
    const upload = await uploadOnCloudinary(req.file.buffer, {
      folder: "snapndesign/staff",
    });
    profileImage = { public_id: upload.public_id, url: upload.secure_url };
  }

  const staff = await User.create({
    firstName: firstName.trim(),
    lastName: lastName.trim(),
    email: email.toLowerCase().trim(),
    password,
    phoneNumber: phoneNumber.trim(),
    role: "staff",
    ownerId,
    isEmailVerified: true, // Staff created by owner — no email verify needed
    profileImage,
    memberSince: new Date(),
  });

  // Send welcome email with credentials
  try {
    await sendEmail(
      staff.email,
      "Welcome to SnapNDesign — Your Login Details",
      staffInviteTemplate(`${firstName} ${lastName}`, email, password)
    );
  } catch (e) {
    console.error("Staff invite email failed:", e.message);
  }

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Staff added successfully",
    data: {
      _id: staff._id,
      firstName: staff.firstName,
      lastName: staff.lastName,
      email: staff.email,
      phoneNumber: staff.phoneNumber,
      profileImage: staff.profileImage,
      role: staff.role,
      isSuspended: staff.isSuspended,
      memberSince: staff.memberSince,
      totalJobs: staff.totalJobs,
    },
  });
});

// ─── GET ALL STAFF (Screen 35 — My Staff table) ───────────────────────────────
export const getAllStaff = catchAsync(async (req, res) => {
  const ownerId = req.user._id;
  const { search = "", status } = req.query;

  const query = { ownerId, role: "staff" };

  if (search) {
    query.$or = [
      { firstName: { $regex: search, $options: "i" } },
      { lastName: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
    ];
  }

  if (status === "Active") query.isSuspended = false;
  if (status === "Suspended") query.isSuspended = true;

  const staffList = await User.find(query)
    .select("-password -otp -resetPasswordOtp -refreshToken")
    .sort({ createdAt: -1 });

  const responseData = staffList.map((s) => ({
    _id: s._id,
    firstName: s.firstName,
    lastName: s.lastName,
    email: s.email,
    phoneNumber: s.phoneNumber,
    profileImage: s.profileImage,
    role: s.role,
    isSuspended: s.isSuspended,
    status: s.isSuspended ? "Suspended" : "Active",
    memberSince: s.memberSince || s.createdAt,
    totalJobs: s.totalJobs,
  }));

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Staff list fetched successfully",
    data: responseData,
    results: responseData.length,
  });
});

// ─── GET SINGLE STAFF (Screen 38/39 — Staff Detail modal) ────────────────────
export const getSingleStaff = catchAsync(async (req, res) => {
  const { id } = req.params;
  const ownerId = req.user._id;

  const staff = await User.findOne({ _id: id, ownerId, role: "staff" }).select(
    "-password -otp -resetPasswordOtp -refreshToken"
  );

  if (!staff) {
    throw new AppError(httpStatus.NOT_FOUND, "Staff not found");
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Staff details fetched",
    data: {
      _id: staff._id,
      firstName: staff.firstName,
      lastName: staff.lastName,
      email: staff.email,
      phoneNumber: staff.phoneNumber,
      profileImage: staff.profileImage,
      role: staff.role,
      isSuspended: staff.isSuspended,
      status: staff.isSuspended ? "Suspended" : "Active",
      memberSince: staff.memberSince || staff.createdAt,
      totalJobs: staff.totalJobs,
    },
  });
});

// ─── TOGGLE STAFF STATUS — Active / Suspended (Screens 38 & 39) ─────────────
export const toggleStaffStatus = catchAsync(async (req, res) => {
  const { id } = req.params;
  const ownerId = req.user._id;

  const staff = await User.findOne({ _id: id, ownerId, role: "staff" });
  if (!staff) {
    throw new AppError(httpStatus.NOT_FOUND, "Staff not found");
  }

  staff.isSuspended = !staff.isSuspended;
  await staff.save();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: staff.isSuspended
      ? "Staff suspended successfully"
      : "Staff activated successfully",
    data: {
      _id: staff._id,
      isSuspended: staff.isSuspended,
      status: staff.isSuspended ? "Suspended" : "Active",
    },
  });
});

// ─── UPDATE STAFF ──────────────────────────────────────────────────────────────
export const updateStaff = catchAsync(async (req, res) => {
  const { id } = req.params;
  const ownerId = req.user._id;
  const { firstName, lastName, phoneNumber } = req.body;

  const staff = await User.findOne({ _id: id, ownerId, role: "staff" });
  if (!staff) {
    throw new AppError(httpStatus.NOT_FOUND, "Staff not found");
  }

  if (firstName) staff.firstName = firstName.trim();
  if (lastName) staff.lastName = lastName.trim();
  if (phoneNumber !== undefined) staff.phoneNumber = phoneNumber.trim();

  if (req.file) {
    if (staff.profileImage?.public_id) {
      await deleteFromCloudinary(staff.profileImage.public_id);
    }
    const upload = await uploadOnCloudinary(req.file.buffer, {
      folder: "snapndesign/staff",
    });
    staff.profileImage = { public_id: upload.public_id, url: upload.secure_url };
  }

  await staff.save();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Staff updated successfully",
    data: {
      _id: staff._id,
      firstName: staff.firstName,
      lastName: staff.lastName,
      email: staff.email,
      phoneNumber: staff.phoneNumber,
      profileImage: staff.profileImage,
    },
  });
});

// ─── DELETE STAFF ─────────────────────────────────────────────────────────────
export const deleteStaff = catchAsync(async (req, res) => {
  const { id } = req.params;
  const ownerId = req.user._id;

  const staff = await User.findOne({ _id: id, ownerId, role: "staff" });
  if (!staff) {
    throw new AppError(httpStatus.NOT_FOUND, "Staff not found");
  }

  if (staff.profileImage?.public_id) {
    await deleteFromCloudinary(staff.profileImage.public_id);
  }

  await User.findByIdAndDelete(id);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Staff deleted successfully",
    data: null,
  });
});

// ─── GET STAFF STATS ──────────────────────────────────────────────────────────
export const getStaffStats = catchAsync(async (req, res) => {
  const ownerId = req.user._id;

  const totalStaff = await User.countDocuments({ ownerId, role: "staff" });
  const activeStaff = await User.countDocuments({
    ownerId,
    role: "staff",
    isSuspended: false,
  });
  const suspendedStaff = await User.countDocuments({
    ownerId,
    role: "staff",
    isSuspended: true,
  });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Staff stats fetched",
    data: { totalStaff, activeStaff, suspendedStaff },
  });
});
