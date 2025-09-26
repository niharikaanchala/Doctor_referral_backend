import User from "../models/UserSchema.js";
import Doctor from "../models/DoctorSchema.js";
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import Receptionist from "../models/Receptionist.js";

const generateToken = (user) => {
  return jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET_KEY, {
    expiresIn: '15d',
  })
}

export const register = async (req, res) => {
  const { name, email, password, phone, confirmPassword, role, photo, gender, age } = req.body;


  try {
    let user = null;
    if (password !== confirmPassword) {
      return res.status(400).json({ message: "Passwords don't match" });
    }

    if (role === 'patient') {
      user = await User.findOne({ email });
    } else if (role === 'doctor') {
      user = await Doctor.findOne({ email });
    }

    // Check if user exists
    if (user) {
      return res.status(400).json({ message: "User already exists" });
    }

    // Check if passwords match


    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashPassword = await bcrypt.hash(password, salt);

    // Create new user
    if (role === 'patient') {
      user = new User({ name, email, password: hashPassword, role, phone, gender, photo, age });

    } else if (role === 'doctor') {
      // Pass the fullName as the name field for the Doctor model
      user = new Doctor({ name, email, password: hashPassword, role, phone, gender, photo });
    }

    await user.save();
    res.status(200).json({ success: true, message: "User successfully created" });
  } catch (error) {
    console.error('Error during user registration:', error);
    res.status(500).json({ success: false, message: "Internal server error, try again" });
  }
};


export const login = async (req, res) => {
  const { email, password } = req.body;
  try {
    let user = null;

    // Try fetching from all 3 collections
    const patient = await User.findOne({ email });
    const receptionist = await Receptionist.findOne({ email });
    const doctor = await Doctor.findOne({ email });

    if (doctor) {
      user = doctor;
    } else if (receptionist) {
      user = receptionist;
    } else if (patient) {
      user = patient;
    }

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // ✅ Check password
    const isPasswordMatch = await bcrypt.compare(password, user.password);
    console.log(isPasswordMatch)
    if (!isPasswordMatch) {
      return res.status(400).json({ success: false, message: "Invalid credentials" });
    }

    // ✅ Generate token
    const token = generateToken(user);

    // ✅ Clean response (remove password field)
    const { password: _, ...rest } = user._doc;

    return res.status(200).json({
      success: true,
      message: "Successfully logged in",
      token,
      data: { ...rest },
      role: user.role, // role comes directly from DB
    });
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ success: false, message: "Failed to login" });
  }
};


export const createReceptionist = async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;

    // doctor id comes from middleware
    const doctorId = req.userId;

    // Check if receptionist already exists
    const existing = await Receptionist.findOne({ email });
    if (existing) {
      return res.status(400).json({ success: false, message: "Email already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const receptionist = new Receptionist({
      name,
      email,
      phone,
      password: hashedPassword,
      doctor: doctorId, // 🔑 attach doctor
    });

    await receptionist.save();

    res.status(201).json({
      success: true,
      message: "Receptionist created successfully",
      data: receptionist,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ✅ Get all receptionists of a doctor
export const getReceptionists = async (req, res) => {
  try {
    const doctorId = req.userId; // comes from middleware
    const receptionists = await Receptionist.find({ doctor: doctorId });
    res.json({ success: true, data: receptionists });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ✅ Delete receptionist (doctor can delete only their own receptionist)
export const deleteReceptionist = async (req, res) => {
  try {
    const doctorId = req.userId;
    const { id } = req.params;

    const receptionist = await Receptionist.findOneAndDelete({
      _id: id,
      doctor: doctorId,
    });

    if (!receptionist) {
      return res.status(404).json({ success: false, message: "Receptionist not found or not yours" });
    }

    res.json({ success: true, message: "Receptionist deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ✅ Update receptionist
export const updateReceptionist = async (req, res) => {
  try {
    const userId = req.userId;
    console.log(userId)

    const updates = req.body;

    if (updates.password) {
      updates.password = await bcrypt.hash(updates.password, 10);
    }

    const receptionist = await Receptionist.findOneAndUpdate(
      { _id: userId},
      updates,
      { new: true }
    );

    if (!receptionist) {
      return res.status(404).json({ success: false, message: "Receptionist not found or not yours" });
    }

    res.json({ success: true, message: "Receptionist updated successfully", data: receptionist });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};


export const getReceptionistProfile = async (req, res) => {
  try {
    // Check role
    if (req.role !== "receptionist") {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const receptionist = await Receptionist.findById(req.userId)
      .populate("doctor", "name email") // optional: include doctor info
      .select("-password"); // hide password

    if (!receptionist) {
      return res.status(404).json({ success: false, message: "Receptionist not found" });
    }

    res.json({ success: true, data: receptionist });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
