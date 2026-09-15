import express from "express";
import {
  createJob,
  getAllJobs,
  getSingleJob,
  updateJobDetails,
  saveRoomCapture,
  saveMeasurements,
  saveSelectedProducts,
  generateAILayout,
  saveDesign,
  saveEstimate,
  generateProposal,
  deleteJob,
  getDashboardStats,
  addProductToJob,
} from "../controller/job.controller.js";
import { protect, isOwnerOrStaff } from "../middleware/auth.middleware.js";
import upload from "../middleware/multer.middleware.js";

const router = express.Router();

router.use(protect, isOwnerOrStaff);

// Dashboard
router.get("/dashboard", getDashboardStats);

// Job CRUD
router.get("/", getAllJobs);
router.post("/", createJob);
router.get("/:id", getSingleJob);
router.patch("/:id", updateJobDetails);
router.delete("/:id", deleteJob);

// Job workflow — step by step
router.patch("/:id/room-capture", saveRoomCapture);                        // Step 2
router.patch("/:id/measurements", saveMeasurements);                       // Step 3
router.patch("/:id/products", saveSelectedProducts);                       // Step 4
router.patch("/:id/ai-layout", generateAILayout);                          // Step 5
router.patch("/:id/design", upload.single("layoutImage"), saveDesign);     // Step 6
router.patch("/:id/estimate", saveEstimate);                               // Step 7
router.post("/:id/proposal", generateProposal);                            // Step 8

// Add product from catalog to a job (Screen 20)
router.post("/add-product", addProductToJob);

export default router;
