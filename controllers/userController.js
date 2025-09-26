import User from "../models/UserSchema.js";
import Booking from "../models/BookingSchema.js";
import Doctor from "../models/DoctorSchema.js"

export const updateUser = async (req, res) => {
  const id = req.params.id;
  try {

    const updatedUser = await User.findByIdAndUpdate(id, { $set: req.body }, { new: true }).select("-password")

    res.status(200).json({ success: true, message: "Successfully Updated", data: updatedUser })
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to Update User" })

  }
}

export const getSingleUser = async (req, res) => {
  const id = req.params.id;
  try {
    const user = await User.findById(id).select("-password");
    if (user) {
      res.status(200).json({ success: true, message: "User Found Successfully", data: user });
    } else {
      res.status(404).json({ success: false, message: "No User Found" });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

export const getAllUser = async (req, res) => {
  const id = req.params.id;
  try {

    const users = await User.find({}).select("-password")

    res.status(200).json({ success: true, message: "Users Found Successfully", data: users })
  } catch (error) {
    res.status(500).json({ success: false, message: "No User Found" })

  }
}


export const deleteUser = async (req, res) => {
  const id = req.params.id;
  try {

    await User.findByIdAndDelete(id)

    res.status(200).json({ success: true, message: "Successfully Deleted User" })
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to Delete User" })

  }
}

export const getUserProfile = async (req, res) => {
  const userId = req.userId
  try {
    const user = await User.findById(userId)
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" })
    }
    const { password, ...rest } = user._doc;

    res.status(200).json({ success: true, message: 'Getting profile info', data: { ...rest }, })
  } catch (err) {
    console.log(err.message)
    res.status(500).json({ success: false, message: "Something went Wrong, cannot get" })
  }
}

export const getMyAppointments = async (req, res) => {
  try {
    // Retrieve bookings and populate doctor information
    const bookings = await Booking.find({ user: req.userId })
      .populate({
        path: 'doctor',
        select: 'name photo specialization averageRating experiences totalRating ticketPrice'
      })
      .sort({ createdAt: -1 }); // Sort by newest first

    if (!bookings || bookings.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No appointments found',
        data: []
      });
    }

    res.status(200).json({
      success: true,
      message: 'Appointments retrieved successfully',
      data: bookings
    });

  } catch (err) {
    console.error(err.message);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve appointments"
    });
  }
}