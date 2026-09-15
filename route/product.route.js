import express from "express";
import {
  createProduct,
  getAllProducts,
  getSingleProduct,
  updateProduct,
  deleteProduct,
  getCategories,
  getAdminCatalog,
} from "../controller/product.controller.js";
import { protect, isOwner } from "../middleware/auth.middleware.js";
import upload from "../middleware/multer.middleware.js";

const router = express.Router();

router.use(protect);

// Public catalog (any logged-in user)
router.get("/", getAllProducts);
router.get("/categories", getCategories);
router.get("/admin-catalog", isOwner, getAdminCatalog);
router.get("/:id", getSingleProduct);

// Owner only — manage catalog
router.post("/", isOwner, upload.array("images", 5), createProduct);
router.patch("/:id", isOwner, upload.array("images", 5), updateProduct);
router.delete("/:id", isOwner, deleteProduct);

export default router;
