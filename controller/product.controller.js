import mongoose from "mongoose";
import Product from "../model/product.model.js";
import AppError from "../errors/AppError.js";
import catchAsync from "../utils/catchAsync.js";
import httpStatus from "http-status";
import sendResponse from "../utils/sendResponse.js";
import { uploadOnCloudinary, deleteFromCloudinary } from "../utils/commonMethod.js";

// ─── CREATE PRODUCT (Screen 40 — Admin: Add Product) ─────────────────────────
export const createProduct = catchAsync(async (req, res) => {
  const {
    sku,
    name,
    category,
    finish,
    width,
    height,
    depth,
    price,
    description,
  } = req.body;

  if (!sku || !name || !category || !finish || !width || !height || !depth || !price) {
    throw new AppError(httpStatus.BAD_REQUEST, "All required fields must be provided");
  }

  const existingSKU = await Product.findOne({ sku: sku.toUpperCase().trim() });
  if (existingSKU) {
    throw new AppError(httpStatus.BAD_REQUEST, "SKU already exists");
  }

  // Handle multiple images
  let images = [];
  if (req.files && req.files.length > 0) {
    for (const file of req.files) {
      const upload = await uploadOnCloudinary(file.buffer, {
        folder: "snapndesign/products",
      });
      images.push({ public_id: upload.public_id, url: upload.secure_url });
    }
  }

  const product = await Product.create({
    sku: sku.toUpperCase().trim(),
    name: name.trim(),
    category,
    finish: finish.trim(),
    width: Number(width),
    height: Number(height),
    depth: Number(depth),
    price: Number(price),
    description: description?.trim() || "",
    images,
    ownerId: req.user._id,
  });

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Product created successfully",
    data: product,
  });
});

// ─── GET ALL PRODUCTS — Catalog (Screen 18 — Mobile Catalog) ─────────────────
export const getAllProducts = catchAsync(async (req, res) => {
  const { search = "", category, page = 1, limit = 20 } = req.query;

  const query = { isActive: true };

  if (category && category !== "All") {
    query.category = category;
  }

  if (search.trim()) {
    query.$or = [
      { name: { $regex: search, $options: "i" } },
      { sku: { $regex: search, $options: "i" } },
      { finish: { $regex: search, $options: "i" } },
    ];
  }

  const skip = (Number(page) - 1) * Number(limit);
  const total = await Product.countDocuments(query);
  const products = await Product.find(query)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(Number(limit));

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Products fetched successfully",
    data: products,
    results: products.length,
    meta: {
      total,
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(total / Number(limit)),
    },
  });
});

// ─── GET SINGLE PRODUCT (Screen 19 — Catalog Details) ────────────────────────
export const getSingleProduct = catchAsync(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError(httpStatus.BAD_REQUEST, "Invalid product ID");
  }

  const product = await Product.findById(id);
  if (!product) {
    throw new AppError(httpStatus.NOT_FOUND, "Product not found");
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Product fetched successfully",
    data: product,
  });
});

// ─── UPDATE PRODUCT ────────────────────────────────────────────────────────────
export const updateProduct = catchAsync(async (req, res) => {
  const { id } = req.params;
  const {
    name,
    category,
    finish,
    width,
    height,
    depth,
    price,
    description,
    isActive,
  } = req.body;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError(httpStatus.BAD_REQUEST, "Invalid product ID");
  }

  const product = await Product.findById(id);
  if (!product) {
    throw new AppError(httpStatus.NOT_FOUND, "Product not found");
  }

  if (name) product.name = name.trim();
  if (category) product.category = category;
  if (finish) product.finish = finish.trim();
  if (width !== undefined) product.width = Number(width);
  if (height !== undefined) product.height = Number(height);
  if (depth !== undefined) product.depth = Number(depth);
  if (price !== undefined) product.price = Number(price);
  if (description !== undefined) product.description = description.trim();
  if (typeof isActive === "boolean") product.isActive = isActive;

  // Handle new images upload
  if (req.files && req.files.length > 0) {
    // Delete old images
    for (const img of product.images) {
      if (img.public_id) await deleteFromCloudinary(img.public_id);
    }
    product.images = [];
    for (const file of req.files) {
      const upload = await uploadOnCloudinary(file.buffer, {
        folder: "snapndesign/products",
      });
      product.images.push({ public_id: upload.public_id, url: upload.secure_url });
    }
  }

  await product.save();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Product updated successfully",
    data: product,
  });
});

// ─── DELETE PRODUCT ────────────────────────────────────────────────────────────
export const deleteProduct = catchAsync(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError(httpStatus.BAD_REQUEST, "Invalid product ID");
  }

  const product = await Product.findById(id);
  if (!product) {
    throw new AppError(httpStatus.NOT_FOUND, "Product not found");
  }

  // Delete images from Cloudinary
  for (const img of product.images) {
    if (img.public_id) await deleteFromCloudinary(img.public_id);
  }

  await Product.findByIdAndDelete(id);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Product deleted successfully",
    data: null,
  });
});

// ─── GET PRODUCT CATEGORIES ────────────────────────────────────────────────────
export const getCategories = catchAsync(async (req, res) => {
  const categories = ["All", "Base", "Wall", "Tall", "Island"];

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Categories fetched",
    data: categories,
  });
});

// ─── GET ADMIN CATALOG TABLE (Screen 40 — Web Admin Product Catalog) ─────────
export const getAdminCatalog = catchAsync(async (req, res) => {
  const { search = "", category, page = 1, limit = 10 } = req.query;

  const query = {};

  if (category && category !== "All") query.category = category;

  if (search.trim()) {
    query.$or = [
      { name: { $regex: search, $options: "i" } },
      { sku: { $regex: search, $options: "i" } },
      { finish: { $regex: search, $options: "i" } },
    ];
  }

  const skip = (Number(page) - 1) * Number(limit);
  const total = await Product.countDocuments(query);
  const products = await Product.find(query)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(Number(limit));

  const responseData = products.map((p) => ({
    _id: p._id,
    sku: p.sku,
    name: p.name,
    category: p.category,
    dimensions: `${p.width}×${p.height}×${p.depth}`,
    finish: p.finish,
    price: p.price,
    isActive: p.isActive,
  }));

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Admin catalog fetched",
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
