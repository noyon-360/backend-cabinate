import mongoose, { Schema } from "mongoose";

const supportSchema = new Schema(
  {
    // Logged-in user (optional — can be anonymous)
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    fullName: {
      type: String,
      required: [true, "Full name is required"],
      trim: true,
    },

    email: {
      type: String,
      required: [true, "Email is required"],
      trim: true,
      lowercase: true,
    },

    contactNumber: {
      type: String,
      required: [true, "Contact number is required"],
      trim: true,
    },

    note: {
      type: String,
      required: [true, "Note is required"],
      trim: true,
      maxlength: 500,
    },

    isResolved: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

const Support = mongoose.model("Support", supportSchema);

export default Support;
