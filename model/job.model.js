import mongoose from "mongoose";

// Job progress steps — matches the 8-step progress bar in Figma
export const JOB_STEPS = [
  "Job Details",          // Step 1
  "Room Capture",         // Step 2
  "Measurements",         // Step 3
  "Select Product",       // Step 4
  "AI Layout",            // Step 5
  "Design",               // Step 6
  "Estimate",             // Step 7
  "Proposal",             // Step 8
];

export const JOB_STATUSES = ["New", "In Progress", "Completed", "Proposal Sent"];

const jobSchema = new mongoose.Schema(
  {
    jobRef: {
      type: String,
      unique: true,
      trim: true,
    },

    // The owner/designer who created this job
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // Staff assigned to this job (optional)
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    // ── Step 1: Job Details ──
    date: {
      type: Date,
      required: [true, "Date is required"],
    },

    customerName: {
      type: String,
      required: [true, "Customer name is required"],
      trim: true,
    },

    propertyAddress: {
      type: String,
      required: [true, "Property address is required"],
      trim: true,
    },

    phoneNumber: {
      type: String,
      required: [true, "Phone number is required"],
      trim: true,
    },

    emailAddress: {
      type: String,
      required: [true, "Email address is required"],
      trim: true,
      lowercase: true,
    },

    notes: {
      type: String,
      default: "",
      trim: true,
    },

    // ── Step 2: Room Capture ──
    roomCapture: {
      method: {
        type: String,
        enum: ["Room Scan", "Manual"],
        default: null,
      },
      capturedAt: { type: Date, default: null },
    },

    // ── Step 3: Measurements ──
    measurements: {
      width: { type: Number, default: null },   // in meters
      depth: { type: Number, default: null },
      height: { type: Number, default: null },
    },

    // ── Step 4: Selected Products ──
    selectedProducts: [
      {
        productId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Product",
          required: true,
        },
        quantity: {
          type: Number,
          default: 1,
          min: 1,
        },
        unitPrice: {
          type: Number,
          required: true,
          min: 0,
        },
        lineTotal: {
          type: Number,
          required: true,
          min: 0,
        },
      },
    ],

    // ── Step 5: AI Layout ──
    aiLayout: {
      status: {
        type: String,
        enum: ["pending", "processing", "completed", "failed"],
        default: null,
      },
      generatedAt: { type: Date, default: null },
      layoutData: { type: mongoose.Schema.Types.Mixed, default: null },
    },

    // ── Step 6: Design (layout image) ──
    design: {
      layoutImage: {
        public_id: { type: String, default: "" },
        url: { type: String, default: "" },
      },
      layoutName: { type: String, default: "Layout A — Recommended" },
    },

    // ── Step 7: Estimate ──
    estimate: {
      subTotal: { type: Number, default: 0 },
      installationCharge: { type: Number, default: 0 },
      deliveryCharge: { type: Number, default: 0 },
      taxRate: { type: Number, default: 10 }, // percentage
      taxAmount: { type: Number, default: 0 },
      total: { type: Number, default: 0 },
    },

    // ── Step 8: Proposal ──
    proposal: {
      generatedAt: { type: Date, default: null },
      pdfUrl: { type: String, default: "" },
      terms: {
        type: String,
        default:
          "50% deposit required upon acceptance. Balance due on installation completion. Price includes supply and installation of all listed cabinets. Valid for 30 days from date of issue.",
      },
    },

    // Current step (1-8) in the job workflow
    currentStep: {
      type: Number,
      default: 1,
      min: 1,
      max: 8,
    },

    // Job status
    status: {
      type: String,
      enum: JOB_STATUSES,
      default: "New",
      index: true,
    },
  },
  { timestamps: true }
);

// Auto-generate jobRef on create
jobSchema.pre("save", function (next) {
  if (!this.jobRef) {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substr(2, 3).toUpperCase();
    this.jobRef = `JOB-${timestamp}${random}`;
  }
  // next();
});

const Job = mongoose.model("Job", jobSchema);

export default Job;
