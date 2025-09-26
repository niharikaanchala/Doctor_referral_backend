import mongoose from "mongoose";

const UserSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  name: { type: String, required: true },
  phone: { type: Number },
  photo: { type: String },
  age: { type: Number },

  role: {
    type: String,
    enum: ["patient", "admin"],
    default: "patient",
  },
  gender: { type: String, enum: ["male", "female", "other"] },
  bloodType: { type: String },
  appointments: [{ type: mongoose.Types.ObjectId, ref: "Appointment" }],
  bp: {
    value: { type: String, default: "" },        // e.g., "120/80"
    known: { type: Boolean, default: true }      // false if user selects "don't know"
  },
  diabetic: {
    value: { type: String, enum: ["yes", "no", ""], default: "" },
    known: { type: Boolean, default: true }
  },
  hyperthyroidism: {
    value: { type: String, enum: ["yes", "no", ""], default: "" },
    known: { type: Boolean, default: true }
  }


});

export default mongoose.model("User", UserSchema);
