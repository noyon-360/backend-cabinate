import mongoose from "mongoose";

const productSchema = new mongoose.Schema(
  {
    sku: {
      type: String,
      required: [true, "SKU is required"],
      unique: true,
      trim: true,
      uppercase: true,
    },

    name: {
      type: String,
      required: [true, "Product name is required"],
      trim: true,
    },

    // Base, Wall, Tall, Island
    category: {
      type: String,
      required: [true, "Category is required"],
      enum: ["Base", "Wall", "Tall", "Island"],
      trim: true,
    },

    // e.g. "White Shaker"
    finish: {
      type: String,
      required: [true, "Finish is required"],
      trim: true,
    },

    // Dimensions in mm
    width: {
      type: Number,
      required: [true, "Width is required"],
      min: 0,
    },

    height: {
      type: Number,
      required: [true, "Height is required"],
      min: 0,
    },

    depth: {
      type: Number,
      required: [true, "Depth is required"],
      min: 0,
    },

    price: {
      type: Number,
      required: [true, "Price is required"],
      min: 0,
    },

    images: [
      {
        public_id: { type: String, default: "" },
        url: { type: String, default: "" },
      },
    ],

    description: {
      type: String,
      default: "",
      trim: true,
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    // Which owner this catalog item belongs to (null = global/system catalog)
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true }
);

// Text index for search
productSchema.index({ name: "text", sku: "text", category: "text" });

const Product = mongoose.model("Product", productSchema);

export default Product;
