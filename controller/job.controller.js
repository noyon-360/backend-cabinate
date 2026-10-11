import mongoose from "mongoose";
import Job from "../model/job.model.js";
import Product from "../model/product.model.js";
import User from "../model/user.model.js";
import AppError from "../errors/AppError.js";
import catchAsync from "../utils/catchAsync.js";
import httpStatus from "http-status";
import sendResponse from "../utils/sendResponse.js";
import { uploadOnCloudinary } from "../utils/commonMethod.js";
import { parseRoomSpec } from "../utils/roomSpec.js";
import { checkLayout } from "../utils/layoutEngine.js";
import { generateSmartLayout } from "../utils/smartLayout.js";
import { BUSINESS } from "../utils/business.js";
import { renderProposalPdf } from "../utils/proposalPdf.js";
import {
  uploadProposalPdf,
  deleteProposalPdf,
  fetchProposalPdf,
} from "../utils/proposalStorage.js";

// Cleared whenever its inputs (walls or products) change.
const EMPTY_LAYOUT = { status: null, generatedAt: null, layoutData: null };

// The design is an edit of the generated layout, so it goes whenever the
// layout is cleared or regenerated.
const clearDesign = (job) => {
  job.design.layout = null;
  job.design.layoutImage = { public_id: "", url: "" };
  clearProposal(job);
};

// Anything shown on the proposal changed: the PDF is rebuilt next time.
const clearProposal = (job) => {
  job.proposal.pdfUrl = "";
  job.proposal.generatedAt = null;
};

// ─── CREATE JOB — Step 1: Job Details (Screen 8) ─────────────────────────────
export const createJob = catchAsync(async (req, res) => {
  const {
    date,
    customerName,
    propertyAddress,
    phoneNumber,
    emailAddress,
    notes,
  } = req.body;

  const ownerId = req.user.role === "staff" ? req.user.ownerId : req.user._id;

  if (!date || !customerName || !propertyAddress || !phoneNumber || !emailAddress) {
    throw new AppError(httpStatus.BAD_REQUEST, "All required fields must be provided");
  }

  const job = await Job.create({
    ownerId,
    assignedTo: req.user.role === "staff" ? req.user._id : null,
    date: new Date(date),
    customerName: customerName.trim(),
    propertyAddress: propertyAddress.trim(),
    phoneNumber: phoneNumber.trim(),
    emailAddress: emailAddress.toLowerCase().trim(),
    notes: notes?.trim() || "",
    status: "New",
    currentStep: 1,
  });

  // Increment user's total job count
  await User.findByIdAndUpdate(req.user._id, { $inc: { totalJobs: 1 } });

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Job created successfully",
    data: job,
  });
});

// ─── GET ALL JOBS (Screen 17 & 33 — Mobile Jobs / Admin Jobs table) ──────────
export const getAllJobs = catchAsync(async (req, res) => {
  const { search = "", status, page = 1, limit = 20 } = req.query;

  // Determine the ownerId — staff sees jobs of their owner
  const ownerId = req.user.role === "staff" ? req.user.ownerId : req.user._id;

  const query = { ownerId };

  if (status && status !== "All") {
    query.status = status;
  }

  if (search.trim()) {
    query.$or = [
      { customerName: { $regex: search, $options: "i" } },
      { propertyAddress: { $regex: search, $options: "i" } },
      { jobRef: { $regex: search, $options: "i" } },
    ];
  }

  const skip = (Number(page) - 1) * Number(limit);
  const total = await Job.countDocuments(query);

  const jobs = await Job.find(query)
    .populate("assignedTo", "firstName lastName email profileImage")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(Number(limit));

  const responseData = jobs.map((job) => ({
    _id: job._id,
    jobRef: job.jobRef,
    date: job.date,
    customerName: job.customerName,
    propertyAddress: job.propertyAddress,
    phoneNumber: job.phoneNumber,
    emailAddress: job.emailAddress,
    status: job.status,
    currentStep: job.currentStep,
    assignedTo: job.assignedTo,
    createdAt: job.createdAt,
  }));

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Jobs fetched successfully",
    data: responseData,
    results: responseData.length,
    meta: {
      total,
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(total / Number(limit)),
    },
  });
});

// ─── GET SINGLE JOB (Screen 9 — Job Details) ──────────────────────────────────
export const getSingleJob = catchAsync(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError(httpStatus.BAD_REQUEST, "Invalid job ID");
  }

  const ownerId = req.user.role === "staff" ? req.user.ownerId : req.user._id;

  const job = await Job.findOne({ _id: id, ownerId })
    .populate("assignedTo", "firstName lastName email profileImage")
    .populate("selectedProducts.productId");

  if (!job) {
    throw new AppError(httpStatus.NOT_FOUND, "Job not found");
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Job fetched successfully",
    data: job,
  });
});

// ─── UPDATE JOB DETAILS (Step 1 edit) ────────────────────────────────────────
export const updateJobDetails = catchAsync(async (req, res) => {
  const { id } = req.params;
  const {
    date,
    customerName,
    propertyAddress,
    phoneNumber,
    emailAddress,
    notes,
    status,
  } = req.body;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError(httpStatus.BAD_REQUEST, "Invalid job ID");
  }

  const ownerId = req.user.role === "staff" ? req.user.ownerId : req.user._id;
  const job = await Job.findOne({ _id: id, ownerId });

  if (!job) {
    throw new AppError(httpStatus.NOT_FOUND, "Job not found");
  }

  if (date) job.date = new Date(date);
  if (customerName) job.customerName = customerName.trim();
  if (propertyAddress) job.propertyAddress = propertyAddress.trim();
  if (phoneNumber) job.phoneNumber = phoneNumber.trim();
  if (emailAddress) job.emailAddress = emailAddress.toLowerCase().trim();
  if (notes !== undefined) job.notes = notes.trim();
  if (status && ["New", "In Progress", "Completed", "Proposal Sent"].includes(status)) {
    job.status = status;
  }
  clearProposal(job);

  await job.save();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Job updated successfully",
    data: job,
  });
});

// ─── SAVE ROOM CAPTURE (Step 2 — Screen 10) ───────────────────────────────────
export const saveRoomCapture = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { method } = req.body; // "Room Scan" | "Manual"

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError(httpStatus.BAD_REQUEST, "Invalid job ID");
  }

  const ownerId = req.user.role === "staff" ? req.user.ownerId : req.user._id;
  const job = await Job.findOne({ _id: id, ownerId });

  if (!job) {
    throw new AppError(httpStatus.NOT_FOUND, "Job not found");
  }

  job.roomCapture = {
    method: method || "Room Scan",
    capturedAt: new Date(),
  };
  job.currentStep = Math.max(job.currentStep, 2);
  job.status = "In Progress";

  await job.save();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Room capture saved",
    data: { roomCapture: job.roomCapture, currentStep: job.currentStep },
  });
});

// ─── SAVE MEASUREMENTS (Step 3 — Screen 11) ───────────────────────────────────
// Body: { room: RoomSpec } (see utils/roomSpec.js).
// Legacy body { width, depth, height } in meters is still accepted.
export const saveMeasurements = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { width, depth, height, room } = req.body;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError(httpStatus.BAD_REQUEST, "Invalid job ID");
  }

  let measurements;
  if (room !== undefined) {
    const spec = parseRoomSpec(room);
    // Keep the legacy fields filled for older clients and the AI layout check.
    measurements = {
      width: spec.walls[0].lengthMm / 1000,
      depth: spec.walls[1] ? spec.walls[1].lengthMm / 1000 : null,
      height: spec.ceilingHeightMm / 1000,
      room: spec,
    };
  } else {
    if (!width || !depth || !height) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "Width, depth, and height are required"
      );
    }
    measurements = {
      width: Number(width),
      depth: Number(depth),
      height: Number(height),
      room: null,
    };
  }

  const ownerId = req.user.role === "staff" ? req.user.ownerId : req.user._id;
  const job = await Job.findOne({ _id: id, ownerId });

  if (!job) {
    throw new AppError(httpStatus.NOT_FOUND, "Job not found");
  }

  job.measurements = measurements;
  job.aiLayout = EMPTY_LAYOUT; // built for the old walls
  clearDesign(job);
  job.currentStep = Math.max(job.currentStep, 3);

  await job.save();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Measurements saved",
    data: { measurements: job.measurements, currentStep: job.currentStep },
  });
});

// ─── SELECT PRODUCTS (Step 4 — Screen 12) ─────────────────────────────────────
// Body: { products: [{ productId, quantity }] }
export const saveSelectedProducts = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { products } = req.body;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError(httpStatus.BAD_REQUEST, "Invalid job ID");
  }

  if (!products || !Array.isArray(products) || products.length === 0) {
    throw new AppError(httpStatus.BAD_REQUEST, "At least one product must be selected");
  }

  const ownerId = req.user.role === "staff" ? req.user.ownerId : req.user._id;
  const job = await Job.findOne({ _id: id, ownerId });

  if (!job) {
    throw new AppError(httpStatus.NOT_FOUND, "Job not found");
  }

  // Validate and enrich products
  const enrichedProducts = [];
  for (const item of products) {
    if (!mongoose.Types.ObjectId.isValid(item.productId)) {
      throw new AppError(httpStatus.BAD_REQUEST, `Invalid product ID: ${item.productId}`);
    }
    const product = await Product.findById(item.productId);
    if (!product) {
      throw new AppError(httpStatus.NOT_FOUND, `Product not found: ${item.productId}`);
    }
    const quantity = Number(item.quantity) || 1;
    enrichedProducts.push({
      productId: product._id,
      quantity,
      unitPrice: product.price,
      lineTotal: product.price * quantity,
    });
  }

  job.selectedProducts = enrichedProducts;
  job.aiLayout = EMPTY_LAYOUT; // built from the old products
  clearDesign(job);
  job.currentStep = Math.max(job.currentStep, 4);

  // Auto-calculate subtotal
  const subTotal = enrichedProducts.reduce((sum, p) => sum + p.lineTotal, 0);
  job.estimate.subTotal = subTotal;

  await job.save();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Products selected successfully",
    data: {
      selectedProducts: job.selectedProducts,
      subTotal,
      currentStep: job.currentStep,
    },
  });
});

// ─── GENERATE AI LAYOUT (Step 5 — Screen 13) ──────────────────────────────────
export const generateAILayout = catchAsync(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError(httpStatus.BAD_REQUEST, "Invalid job ID");
  }

  const ownerId = req.user.role === "staff" ? req.user.ownerId : req.user._id;
  const job = await Job.findOne({ _id: id, ownerId }).populate(
    "selectedProducts.productId"
  );

  if (!job) {
    throw new AppError(httpStatus.NOT_FOUND, "Job not found");
  }

  const room = job.measurements?.room?.toObject();
  if (!room) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Save the room walls in Measurements before generating a layout"
    );
  }

  // Products deleted from the catalog since selection populate as null.
  const products = job.selectedProducts
    .filter((p) => p.productId)
    .map((p) => ({ product: p.productId, quantity: p.quantity }));
  if (products.length === 0) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Select products before generating a layout"
    );
  }

  job.aiLayout = {
    status: "completed",
    generatedAt: new Date(),
    // LLM-assisted when Ollama is reachable, rules-only otherwise.
    layoutData: await generateSmartLayout(room, products),
  };
  clearDesign(job);
  job.currentStep = Math.max(job.currentStep, 5);

  await job.save();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "AI Layout generated successfully",
    data: {
      aiLayout: job.aiLayout,
      currentStep: job.currentStep,
    },
  });
});

// ─── SAVE DESIGN (Step 6 — Screen 14) ─────────────────────────────────────────
// Multipart: layoutName?, layout? (JSON string: { items: [{...item, wallId,
// offsetMm}] }), layoutImage? (PNG file of the elevation).
export const saveDesign = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { layoutName } = req.body;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError(httpStatus.BAD_REQUEST, "Invalid job ID");
  }

  const ownerId = req.user.role === "staff" ? req.user.ownerId : req.user._id;
  const job = await Job.findOne({ _id: id, ownerId });

  if (!job) {
    throw new AppError(httpStatus.NOT_FOUND, "Job not found");
  }

  if (req.body.layout !== undefined) {
    let edited;
    try {
      edited =
        typeof req.body.layout === "string"
          ? JSON.parse(req.body.layout)
          : req.body.layout;
    } catch {
      throw new AppError(httpStatus.BAD_REQUEST, "layout must be JSON");
    }

    const room = job.measurements?.room?.toObject();
    const base = job.aiLayout?.layoutData;
    if (!room || !base?.items) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "Generate the layout before saving a design"
      );
    }

    const { layout, problems } = checkLayout(room, base, edited?.items);
    if (problems) {
      throw new AppError(httpStatus.BAD_REQUEST, problems.join("; "));
    }
    job.design.layout = layout;
  }

  job.design.layoutName = layoutName || "Layout A — Recommended";

  if (req.file) {
    const upload = await uploadOnCloudinary(req.file.buffer, {
      folder: "snapndesign/layouts",
    });
    job.design.layoutImage = {
      public_id: upload.public_id,
      url: upload.secure_url,
    };
  }

  clearProposal(job);
  job.currentStep = Math.max(job.currentStep, 6);

  await job.save();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Design saved successfully",
    data: { design: job.design, currentStep: job.currentStep },
  });
});

// ─── SAVE ESTIMATE (Step 7 — Screen 15) ──────────────────────────────────────
export const saveEstimate = catchAsync(async (req, res) => {
  const { id } = req.params;
  const {
    installationCharge = 0,
    deliveryCharge = 0,
    taxRate = 10,
  } = req.body;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError(httpStatus.BAD_REQUEST, "Invalid job ID");
  }

  const ownerId = req.user.role === "staff" ? req.user.ownerId : req.user._id;
  const job = await Job.findOne({ _id: id, ownerId });

  if (!job) {
    throw new AppError(httpStatus.NOT_FOUND, "Job not found");
  }

  const subTotal = job.estimate.subTotal || 0;
  const taxAmount = ((subTotal + Number(installationCharge) + Number(deliveryCharge)) * Number(taxRate)) / 100;
  const total =
    subTotal +
    Number(installationCharge) +
    Number(deliveryCharge) +
    taxAmount;

  job.estimate = {
    subTotal,
    installationCharge: Number(installationCharge),
    deliveryCharge: Number(deliveryCharge),
    taxRate: Number(taxRate),
    taxAmount: Math.round(taxAmount * 100) / 100,
    total: Math.round(total * 100) / 100,
  };
  clearProposal(job);
  job.currentStep = Math.max(job.currentStep, 7);

  await job.save();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Estimate saved successfully",
    data: { estimate: job.estimate, currentStep: job.currentStep },
  });
});

// ─── GENERATE PROPOSAL (Step 8 — Screen 16) ───────────────────────────────────
const DEFAULT_TERMS =
  "50% deposit required upon acceptance. Balance due on installation completion. Price includes supply and installation of all listed cabinets. Valid for 30 days from date of issue.";

// Everything the Proposal screen and PDF show, already computed. The app
// renders this as-is so the screen and the PDF can't disagree.
const buildProposalView = (job) => ({
  business: BUSINESS,
  jobRef: job.jobRef,
  date: job.proposal.generatedAt,
  customer: {
    name: job.customerName,
    address: job.propertyAddress,
    phone: job.phoneNumber,
    email: job.emailAddress,
  },
  layoutImageUrl: job.design.layoutImage?.url || null,
  lines: job.selectedProducts.map((p) => ({
    name: p.productId?.name ?? "Removed product",
    sku: p.productId?.sku ?? "",
    quantity: p.quantity,
    unitPrice: p.unitPrice,
    lineTotal: p.lineTotal,
  })),
  subTotal: job.estimate.subTotal,
  installationCharge: job.estimate.installationCharge,
  deliveryCharge: job.estimate.deliveryCharge,
  taxRate: job.estimate.taxRate,
  taxAmount: job.estimate.taxAmount,
  total: job.estimate.total,
  terms: job.proposal.terms || DEFAULT_TERMS,
});

// Body: { terms? }. Builds the PDF only when something on it changed since
// the last one (see clearProposal); otherwise returns the stored one.
export const generateProposal = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { terms } = req.body ?? {};

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError(httpStatus.BAD_REQUEST, "Invalid job ID");
  }

  const ownerId = req.user.role === "staff" ? req.user.ownerId : req.user._id;
  const job = await Job.findOne({ _id: id, ownerId }).populate(
    "selectedProducts.productId"
  );

  if (!job) {
    throw new AppError(httpStatus.NOT_FOUND, "Job not found");
  }

  if (job.currentStep < 7 || job.selectedProducts.length === 0) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Save the estimate before generating the proposal"
    );
  }

  if (terms && terms !== job.proposal.terms) {
    job.proposal.terms = terms;
    clearProposal(job);
  }

  // Older proposals were public files without a publicId; rebuild those
  // as private ones too.
  if (!job.proposal.pdfUrl || !job.proposal.pdfPublicId) {
    const previous = job.proposal.pdfPublicId;
    job.proposal.generatedAt = new Date();
    const pdf = await renderProposalPdf(buildProposalView(job));
    const { publicId, url } = await uploadProposalPdf(pdf, job.jobRef);
    job.proposal.pdfUrl = url;
    job.proposal.pdfPublicId = publicId;
    await deleteProposalPdf(previous);
  }

  job.currentStep = 8;
  job.status = "Proposal Sent";

  await job.save();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Proposal generated successfully",
    data: { proposal: buildProposalView(job), currentStep: job.currentStep },
  });
});

// ─── DOWNLOAD PROPOSAL PDF (Step 8) ───────────────────────────────────────────
// Streams the private PDF to an authorised user. Call POST /proposal first;
// it (re)builds the file when the job changed.
export const getProposalPdf = catchAsync(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError(httpStatus.BAD_REQUEST, "Invalid job ID");
  }

  const ownerId = req.user.role === "staff" ? req.user.ownerId : req.user._id;
  const job = await Job.findOne({ _id: id, ownerId });

  if (!job) {
    throw new AppError(httpStatus.NOT_FOUND, "Job not found");
  }
  if (!job.proposal.pdfUrl || !job.proposal.pdfPublicId) {
    throw new AppError(httpStatus.NOT_FOUND, "Generate the proposal first");
  }

  const pdf = await fetchProposalPdf(job.proposal.pdfPublicId);
  res.set({
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="Proposal-${job.jobRef}.pdf"`,
    "Cache-Control": "private, no-store",
  });
  res.send(pdf);
});

// ─── DELETE JOB ────────────────────────────────────────────────────────────────
export const deleteJob = catchAsync(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError(httpStatus.BAD_REQUEST, "Invalid job ID");
  }

  const ownerId = req.user.role === "staff" ? req.user.ownerId : req.user._id;
  const job = await Job.findOne({ _id: id, ownerId });

  if (!job) {
    throw new AppError(httpStatus.NOT_FOUND, "Job not found");
  }

  await Job.findByIdAndDelete(id);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Job deleted successfully",
    data: null,
  });
});

// ─── DASHBOARD STATS (Screen 7 & 32 — Home & Admin Dashboard) ────────────────
export const getDashboardStats = catchAsync(async (req, res) => {
  const ownerId = req.user.role === "staff" ? req.user.ownerId : req.user._id;

  const [
    totalJobs,
    activeJobs,
    completedJobs,
    proposalSentJobs,
    recentJobs,
    totalStaff,
    totalCatalog,
  ] = await Promise.all([
    Job.countDocuments({ ownerId }),
    Job.countDocuments({ ownerId, status: "In Progress" }),
    Job.countDocuments({ ownerId, status: "Completed" }),
    Job.countDocuments({ ownerId, status: "Proposal Sent" }),
    Job.find({ ownerId })
      .sort({ createdAt: -1 })
      .limit(10)
      .populate("assignedTo", "firstName lastName email profileImage"),
    User.countDocuments({ ownerId, role: "staff" }),
    Product.countDocuments({ isActive: true }),
  ]);

  // "This Month" revenue from completed proposals
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const monthlyRevenue = await Job.aggregate([
    {
      $match: {
        ownerId: new mongoose.Types.ObjectId(ownerId),
        status: { $in: ["Completed", "Proposal Sent"] },
        createdAt: { $gte: startOfMonth },
      },
    },
    {
      $group: {
        _id: null,
        total: { $sum: "$estimate.total" },
      },
    },
  ]);

  const thisMonthRevenue = monthlyRevenue[0]?.total || 0;

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Dashboard stats fetched",
    data: {
      totalJobs,
      activeJobs,
      completedJobs,
      proposalSentJobs,
      totalStaff,
      totalCatalog,
      thisMonthRevenue,
      recentJobs: recentJobs.map((job) => ({
        _id: job._id,
        jobRef: job.jobRef,
        customerName: job.customerName,
        propertyAddress: job.propertyAddress,
        status: job.status,
        currentStep: job.currentStep,
        assignedTo: job.assignedTo,
        date: job.date,
        createdAt: job.createdAt,
      })),
    },
  });
});

// ─── ADD PRODUCT FROM CATALOG TO A JOB (Screen 20) ────────────────────────────
export const addProductToJob = catchAsync(async (req, res) => {
  const { jobId, productId, quantity = 1 } = req.body;

  if (
    !mongoose.Types.ObjectId.isValid(jobId) ||
    !mongoose.Types.ObjectId.isValid(productId)
  ) {
    throw new AppError(httpStatus.BAD_REQUEST, "Invalid job or product ID");
  }

  const ownerId = req.user.role === "staff" ? req.user.ownerId : req.user._id;
  const [job, product] = await Promise.all([
    Job.findOne({ _id: jobId, ownerId }),
    Product.findById(productId),
  ]);

  if (!job) throw new AppError(httpStatus.NOT_FOUND, "Job not found");
  if (!product) throw new AppError(httpStatus.NOT_FOUND, "Product not found");

  // Check if product already added
  const existing = job.selectedProducts.find(
    (p) => p.productId.toString() === productId
  );

  if (existing) {
    existing.quantity += Number(quantity);
    existing.lineTotal = existing.unitPrice * existing.quantity;
  } else {
    job.selectedProducts.push({
      productId: product._id,
      quantity: Number(quantity),
      unitPrice: product.price,
      lineTotal: product.price * Number(quantity),
    });
  }

  // Recalculate subTotal
  job.estimate.subTotal = job.selectedProducts.reduce(
    (sum, p) => sum + p.lineTotal,
    0
  );
  job.aiLayout = EMPTY_LAYOUT; // built from the old products
  clearDesign(job);

  await job.save();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Product added to job",
    data: {
      jobRef: job.jobRef,
      selectedProducts: job.selectedProducts,
      subTotal: job.estimate.subTotal,
    },
  });
});
