import express from "express";
import authRoute from "../route/auth.route.js";
import userRoute from "../route/user.route.js";
import staffRoute from "../route/staff.route.js";
import productRoute from "../route/product.route.js";
import jobRoute from "../route/job.route.js";
import supportRoute from "../route/support.route.js";

const router = express.Router();

router.use("/auth", authRoute);
router.use("/user", userRoute);
router.use("/staff", staffRoute);
router.use("/products", productRoute);
router.use("/jobs", jobRoute);
router.use("/support", supportRoute);

export default router;
