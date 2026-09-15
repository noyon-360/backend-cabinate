import Support from "../model/support.model.js";
import AppError from "../errors/AppError.js";
import catchAsync from "../utils/catchAsync.js";
import httpStatus from "http-status";
import sendResponse from "../utils/sendResponse.js";

// ─── SUBMIT CONTACT US (Screen 26) ───────────────────────────────────────────
export const submitContactUs = catchAsync(async (req, res) => {
  const { fullName, email, contactNumber, note } = req.body;

  if (!fullName || !email || !contactNumber || !note) {
    throw new AppError(httpStatus.BAD_REQUEST, "All fields are required");
  }

  const support = await Support.create({
    userId: req.user?._id || null,
    fullName: fullName.trim(),
    email: email.toLowerCase().trim(),
    contactNumber: contactNumber.trim(),
    note: note.trim(),
  });

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Your message has been submitted. We'll get back to you soon.",
    data: support,
  });
});

// ─── GET ALL SUPPORT MESSAGES (Admin only) ────────────────────────────────────
export const getAllSupportMessages = catchAsync(async (req, res) => {
  const { page = 1, limit = 20, isResolved } = req.query;

  const query = {};
  if (typeof isResolved !== "undefined") {
    query.isResolved = isResolved === "true";
  }

  const skip = (Number(page) - 1) * Number(limit);
  const total = await Support.countDocuments(query);
  const messages = await Support.find(query)
    .populate("userId", "firstName lastName email")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(Number(limit));

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Support messages fetched",
    data: messages,
    results: messages.length,
    meta: {
      total,
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(total / Number(limit)),
    },
  });
});

// ─── MARK AS RESOLVED ─────────────────────────────────────────────────────────
export const markResolved = catchAsync(async (req, res) => {
  const { id } = req.params;

  const message = await Support.findByIdAndUpdate(
    id,
    { isResolved: true },
    { new: true }
  );

  if (!message) {
    throw new AppError(httpStatus.NOT_FOUND, "Support message not found");
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Marked as resolved",
    data: message,
  });
});
