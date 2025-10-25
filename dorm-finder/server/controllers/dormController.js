// controllers/dormController.js
import mongoose from "mongoose";
import Dorm from "../models/Dorm.js";

const isValidObjectId = (id) => mongoose.isValidObjectId(id);

/**
 * GET /api/dorms
 * Optional query:
 *  - q: text search in name
 *  - types: comma list (dorm,apartment,condo)
 *  - north, south, east, west: map bounds (floats)
 *  - limit: max results (<= 1000)
 */
export async function getAllDorms(req, res, next) {
  try {
    const { q, types, north, south, east, west } = req.query;
    const filter = {};
    const limit = Math.min(Number(req.query.limit) || 1000, 1000);

    if (q) filter.name = { $regex: q, $options: "i" };
    if (types) filter.type = { $in: String(types).split(",") };

    const hasBounds =
      north !== undefined &&
      south !== undefined &&
      east !== undefined &&
      west !== undefined;

    if (hasBounds) {
      const n = Number(north);
      const s = Number(south);
      const e = Number(east);
      const w = Number(west);
      if ([n, s, e, w].some(Number.isNaN)) {
        return res.status(400).json({
          error: "Invalid bounds: north/south/east/west must be numbers",
        });
      }
      filter.location = {
        $geoWithin: {
          $box: [
            [w, s],
            [e, n],
          ],
        },
      };
    }

    const items = await Dorm.find(filter).limit(limit);
    res.json(items);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/dorms/:id
 */
export async function getDormById(req, res, next) {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ error: "Invalid ID format" });
    }
    const dorm = await Dorm.findById(id);
    if (!dorm) return res.status(404).json({ error: "Not found" });
    res.json(dorm);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/dorms
 * Required fields:
 *  - name (string)
 *  - location.coordinates [lng, lat]
 */
export async function createDorm(req, res, next) {
  try {
    const dorm = await Dorm.create(req.body);
    res.status(201).json(dorm);
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/dorms/:id
 * Partial updates allowed
 */
export async function updateDorm(req, res, next) {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ error: "Invalid ID format" });
    }
    const dorm = await Dorm.findByIdAndUpdate(id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!dorm) return res.status(404).json({ error: "Not found" });
    res.json(dorm);
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/dorms/:id
 */
export async function deleteDorm(req, res, next) {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ error: "Invalid ID format" });
    }
    const dorm = await Dorm.findByIdAndDelete(id);
    if (!dorm) return res.status(404).json({ error: "Not found" });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

export default {
  getAllDorms,
  getDormById,
  createDorm,
  updateDorm,
  deleteDorm,
};
