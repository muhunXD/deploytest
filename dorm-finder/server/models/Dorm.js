import mongoose from "mongoose";

const dormSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    type: { type: String, enum: ["dorm", "apartment", "condo"], default: "dorm" },
    // Additional descriptive information about the dorm
    description: { type: String, trim: true },
    // Image URLs (array) - GitHub permalinks or raw URLs
    imageUrl: {
      type: [String],
      default: [],
      set: (v) => {
        if (Array.isArray(v)) {
          return v
            .filter((x) => x != null)
            .map((x) => String(x).trim())
            .filter((s) => s.length > 0);
        }
        if (typeof v === "string") {
          const s = v.trim();
          return s ? [s] : [];
        }
        return [];
      },
      validate: {
        validator: (arr) =>
          Array.isArray(arr) &&
          arr.every(
            (v) =>
              v.startsWith("https://raw.githubusercontent.com/") ||
              (v.startsWith("https://github.com/") && v.includes("/blob/"))
          ),
        message:
          "imageUrl items must be GitHub permalinks (raw.githubusercontent.com or github.com/.../blob/...)",
      },
    },
    location: {
      type: { type: String, enum: ["Point"], default: "Point", required: true },
      // IMPORTANT: [lng, lat]
      coordinates: {
        type: [Number],
        required: true,
        validate: (v) => Array.isArray(v) && v.length === 2,
        // Accept accidental [lat, lng] and normalize to [lng, lat]
        set: (v) => {
          if (!Array.isArray(v) || v.length < 2) return v;
          let a = Number(v[0]); // expected lng
          let b = Number(v[1]); // expected lat
          // If second value looks invalid as latitude but first looks valid, swap
          // Typical mistake: [lat, lng] e.g., [13.8, 100.5]
          if (Number.isFinite(a) && Number.isFinite(b)) {
            const latLooksValid = Math.abs(b) <= 90;
            const firstLooksLat = Math.abs(a) <= 90 && Math.abs(b) > 90;
            if (firstLooksLat) {
              // Given [lat, lng] -> return [lng, lat]
              return [b, a];
            }
            // If already looks like [lng, lat], keep as is
            if (latLooksValid) return [a, b];
            // As a last resort, swap to keep within ranges when possible
            if (Math.abs(a) <= 90 && Math.abs(b) <= 180) return [b, a];
          }
          return [a, b];
        },
      },
    },
    price: {
      min: Number,
      max: Number,
      currency: { type: String, default: "THB" },
    },
    amenities: [String],
    // Distance related info, e.g., distance from dorm to university
    distance: {
      toUniversity: {
        value: { type: Number, min: 0 }, // numeric distance value
        unit: { type: String, enum: ["m", "km"], default: "km" }, // unit of distance
      },
    },
  },
  { timestamps: true }
);

// Geo index for map queries
dormSchema.index({ location: "2dsphere" });

export default mongoose.model("Dorm", dormSchema);
