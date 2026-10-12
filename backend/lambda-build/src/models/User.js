import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ["OFFICER", "MANAGER"], default: "OFFICER" },
  },
  { timestamps: true }
);
export const User = mongoose.model("User", userSchema);
