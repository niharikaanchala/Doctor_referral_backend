// models/Receptionist.js
import mongoose from "mongoose";

const receptionistSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    phone: { type: String, required: true },
    password: { type: String, required: true, minlength: 6 },
    role: {
      type: String,
      default: "receptionist",
      enum: ["receptionist"],
    },
    isActive: { type: Boolean, default: true },
      photo: { type: String },  

    // Link receptionist to a doctor
    doctor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Doctor",
      required: true,
    },
    about: { type: String },
  },
  { timestamps: true }
);

export default mongoose.model("Receptionist", receptionistSchema);
