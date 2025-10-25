// routes/dormRoutes.js
import { Router } from "express";
import {
  getAllDorms,
  getDormById,
  createDorm,
  updateDorm,
  deleteDorm,
} from "../controllers/dormController.js";

const router = Router();

// List + filters (q, types, bounds, limit)
router.get("/", getAllDorms);

// Get one by ID
router.get("/:id", getDormById);

// Create
router.post("/", createDorm);

// Update
router.put("/:id", updateDorm);

// Delete
router.delete("/:id", deleteDorm);

export default router;
