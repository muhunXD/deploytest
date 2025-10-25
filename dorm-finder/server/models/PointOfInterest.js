import mongoose from "mongoose";

// Point of Interest (POI) schema
// Aligns categories with client MapPage keys: seven, pharmacy, food, laundry, bar, bike, barber, printer, atm
const poiSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    category: {
      type: String,
      required: true,
      enum: [
        "seven",
        "pharmacy",
        "food",
        "laundry",
        "bar",
        "bike",
        "barber",
        "printer",
        "atm",
      ],
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
          if (Number.isFinite(a) && Number.isFinite(b)) {
            const latLooksValid = Math.abs(b) <= 90;
            const firstLooksLat = Math.abs(a) <= 90 && Math.abs(b) > 90;
            if (firstLooksLat) return [b, a];
            if (latLooksValid) return [a, b];
            if (Math.abs(a) <= 90 && Math.abs(b) <= 180) return [b, a];
          }
          return [a, b];
        },
      },
    },
    description: { type: String, trim: true },
    address: { type: String, trim: true },
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
    tags: [String],
  },
  { timestamps: true }
);

// Geo index for map queries
poiSchema.index({ location: "2dsphere" });

export default mongoose.model("PointOfInterest", poiSchema);
