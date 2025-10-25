// config/db.js
import mongoose from "mongoose";

const DEFAULT_DB_URI = "mongodb://127.0.0.1:27017/dorm-finder";

const connectDB = async () => {
  const uri =
    process.env.MONGODB_URI || process.env.MONGO_URI || DEFAULT_DB_URI;
  if (!process.env.MONGODB_URI && !process.env.MONGO_URI) {
    console.warn(
      `[mongo] using fallback local connection string (${DEFAULT_DB_URI}).`
    );
  }

  try {
    await mongoose.connect(uri, {
      autoIndex: process.env.NODE_ENV !== "production",
    });
    console.log("MongoDB connected");
  } catch (error) {
    console.error("MongoDB connection failed:", error.message);
    process.exit(1);
  }
};

export default connectDB;
