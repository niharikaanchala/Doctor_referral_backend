import Doctor from "../models/DoctorSchema.js";
import Booking from "../models/BookingSchema.js";
import { addDays } from "date-fns";



export const updateDoctor = async (req, res) => {
  const id = req.params.id;
  try {

    const updatedDoctor = await Doctor.findByIdAndUpdate(id, { $set: req.body }, { new: true }).select("-password")

    res.status(200).json({ success: true, message: "Successfully Updated", data: updatedDoctor })
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to Update Doctor" })

  }
}

export const getSingleDoctor = async (req, res) => {
  const id = req.params.id;
  try {
    const doctor = await Doctor.findById(id).populate("reviews").select("-password");
    if (doctor) {
      res.status(200).json({ success: true, message: "Doctor Found Successfully", data: doctor });
    } else {
      res.status(404).json({ success: false, message: "No Doctor Found" });
    }
  } catch (error) {
    console.log(error.message)
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

export const getAllDoctor = async (req, res) => {


  // const id = req.params.id;
  try {
    const { query } = req.query;
    let doctors;
    if (query) {
      doctors = await Doctor.find({
        isApproved: 'approved',
        $or: [{ name: { $regex: query, $options: "i" } }, { specialization: { $regex: query, $options: "i" } }]
      }).select("-password")
    }
    else {
      doctors = await Doctor.find({ isApproved: "approved" }).select("-password")

    }


    res.status(200).json({ success: true, message: "Doctors Found Successfully", data: doctors })
  } catch (error) {
    res.status(500).json({ success: false, message: "No Doctor Found" })

  }
}


export const deleteDoctor = async (req, res) => {
  const id = req.params.id;
  try {

    await Doctor.findByIdAndDelete(id)

    res.status(200).json({ success: true, message: "Successfully Deleted Doctor" })
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to Delete Doctor" })

  }
}

export const getDoctorProfile = async (req, res) => {
  const doctorId = req.userId
  try {
    const doctor = await Doctor.findById(doctorId)
    if (!doctor) {
      return res.status(404).json({ success: false, message: "Doctor not found" })
    }
    const { password, ...rest } = doctor._doc;
    const appointments = await Booking.find({ doctor: doctorId }).sort({ createdAt: -1 })
      .populate({
        path: 'user',
        select: 'name email gender photo'
      })
      .select('ticketPrice isPaid createdAt unreadPatientUpdates status lastViewedByDoctor timeSlot appointmentDate');

    res.status(200).json({ success: true, message: 'Getting profile info', data: { ...rest, appointments }, })
  } catch (err) {
    console.log(err.message)
    res.status(500).json({ success: false, message: "Something went Wrong, cannot get" })
  }
}



export const getAvailableDates = async (req, res) => {
  try {
    const doctorId = req.params.id;
    const daysToCheck = 30; // how many days ahead to check

    const doctor = await Doctor.findById(doctorId);
    if (!doctor) {
      return res.status(404).json({ success: false, message: "Doctor not found" });
    }

    const allSlots = doctor.timeSlots; // e.g., [{ day: 'monday', ... }]
    const allowedDays = [...new Set(allSlots.map(slot => slot.day.toLowerCase()))];

    const bookings = await Booking.find({
      doctor: doctorId,
      appointmentDate: { $gte: new Date() }
    });

    // Group existing bookings by date + time
    const bookedMap = {}; // e.g. { '2025-07-25': ['09:00-09:30', '10:00-10:30'] }
    for (const booking of bookings) {
      const dateStr = booking.appointmentDate.toISOString().split("T")[0];
      const timeKey = `${booking.timeSlot.startingTime}-${booking.timeSlot.endingTime}`;
      if (!bookedMap[dateStr]) bookedMap[dateStr] = new Set();
      bookedMap[dateStr].add(timeKey);
    }

    const resultDates = [];

    for (let i = 0; i < daysToCheck; i++) {
      const date = addDays(new Date(), i);
      const weekday = date.toLocaleDateString("en-US", { weekday: "long" }).toLowerCase();

      if (!allowedDays.includes(weekday)) continue;

      const dateStr = date.toISOString().split("T")[0];

      // All available slots for this weekday
      const slotsForDay = allSlots.filter(slot => slot.day.toLowerCase() === weekday && slot.isAvailable);
      const totalSlots = slotsForDay.length;
      const bookedCount = bookedMap[dateStr]?.size || 0;

      if (bookedCount < totalSlots) {
        resultDates.push(dateStr); // valid and not fully booked
      }
    }

    return res.status(200).json({
      success: true,
      availableDates: resultDates
    });

  } catch (err) {
    console.error("Error in getAvailableDates:", err.message);
    return res.status(500).json({ success: false, message: "Failed to get available dates" });
  }
};

// Add these to your existing doctorController.js

export const filterDoctorAppointments = async (req, res) => {
  try {
    const doctorId = req.userId;
    const { date, startingTime, endingTime } = req.query;

    const query = { doctor: doctorId };

    if (date) {
      // Filter by date (whole day)
      const startDate = new Date(date);
      const endDate = new Date(date);
      endDate.setDate(endDate.getDate() + 1);

      query.appointmentDate = {
        $gte: startDate,
        $lt: endDate
      };
    }

    if (startingTime && endingTime) {
      query["timeSlot.startingTime"] = startingTime;
      query["timeSlot.endingTime"] = endingTime;
    }

    const appointments = await Booking.find(query)
      .populate('user', 'name email gender photo')
      .sort({ appointmentDate: -1 });

    res.status(200).json({ success: true, data: appointments });
  } catch (err) {
    console.error("Error filtering appointments:", err.message);
    res.status(500).json({ success: false, message: "Failed to filter appointments" });
  }
};

export const cancelAppointments = async (req, res) => {
  try {
    const doctorId = req.userId;
    const { date, startingTime, endingTime } = req.body;

    if (!date) {
      return res.status(400).json({ success: false, message: "Date is required" });
    }

    const query = {
      doctor: doctorId,
      appointmentDate: {
        $gte: new Date(new Date(date).setHours(0, 0, 0, 0)),
        $lt: new Date(new Date(date).setHours(23, 59, 59, 999))
      },
      status: { $nin: ['cancelled', 'completed'] }
    };

    if (startingTime && endingTime) {
      query["timeSlot.startingTime"] = startingTime;
      query["timeSlot.endingTime"] = endingTime;
    }

    const result = await Booking.updateMany(
      query,
      { $set: { status: 'cancelled', unreadPatientUpdates: 1 } }
    );

    res.status(200).json({
      success: true,
      message: startingTime && endingTime
        ? `${result.modifiedCount} appointments cancelled for the selected time slot`
        : `${result.modifiedCount} appointments cancelled for the selected date`
    });

  } catch (err) {
    console.error("Cancel error:", err);
    res.status(500).json({ success: false, message: "Failed to cancel appointments" });
  }
};
export const getAvailableSlots = async (req, res) => {
  try {
    const doctorId = req.userId; // From authenticated user
    const { date } = req.body; // Get date from request body

    if (!date) {
      return res.status(400).json({
        success: false,
        message: "Date is required in request body"
      });
    }

    const doctor = await Doctor.findById(doctorId);
    if (!doctor) {
      return res.status(404).json({
        success: false,
        message: "Doctor not found"
      });
    }

    const appointmentDate = new Date(date);
    if (isNaN(appointmentDate.getTime())) {
      return res.status(400).json({
        success: false,
        message: "Invalid date format"
      });
    }

    const weekday = appointmentDate.toLocaleDateString("en-US", {
      weekday: "long"
    }).toLowerCase();

    // Get all available slots for this weekday
    const availableSlots = doctor.timeSlots
      .filter(slot =>
        slot.day.toLowerCase() === weekday &&
        slot.isAvailable
      )
      .map(slot => ({
        day: slot.day,
        startingTime: slot.startingTime,
        endingTime: slot.endingTime
      }));
    console.log(availableSlots)
    return res.status(200).json({
      success: true,
      availableSlots
    });

  } catch (err) {
    console.error("Error in getAvailableSlots:", err);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching available slots"
    });
  }
};

export const getBlockedDates = async (req, res) => {
  try {
    const doctorId = req.params.id;
    // console.log(doctorId)

    const doctor = await Doctor.findById(doctorId);
    if (!doctor) {
      return res.status(404).json({ success: false, message: "Doctor not found" });
    }

    const allowedDays = [...new Set(doctor.timeSlots.map(slot => slot.day.toLowerCase()))];
    const bookings = await Booking.find({
      doctor: doctorId,
      appointmentDate: { $gte: new Date() }
    });

    // Map of date => number of bookings
    const bookedMap = {}; // { "2025-07-28": Set([...slots]) }
    for (const booking of bookings) {
      const dateStr = booking.appointmentDate.toISOString().split("T")[0];
      const slotKey = `${booking.timeSlot.startingTime}-${booking.timeSlot.endingTime}`;

      if (!bookedMap[dateStr]) bookedMap[dateStr] = new Set();
      bookedMap[dateStr].add(slotKey);
    }

    const blockedDates = [];

    const daysToCheck = 30;
    for (let i = 0; i < daysToCheck; i++) {
      const date = addDays(new Date(), i);
      const weekday = date.toLocaleDateString("en-US", { weekday: "long" }).toLowerCase();

      if (!allowedDays.includes(weekday)) continue;

      const slotsForDay = doctor.timeSlots.filter(slot => slot.day.toLowerCase() === weekday && slot.isAvailable);
      const dateStr = date.toISOString().split("T")[0];

      const totalSlots = slotsForDay.length;
      const bookedCount = bookedMap[dateStr]?.size || 0;

      if (bookedCount >= totalSlots) {
        blockedDates.push(dateStr); // All slots booked for this allowed date
      }
    }

    return res.status(200).json({
      success: true,
      blockedDates
    });

  } catch (err) {
    console.error("Error in getBlockedDates:", err.message);
    return res.status(500).json({ success: false, message: "Failed to get blocked dates" });
  }
};
export const getBlockedDatesWithSlots = async (req, res) => {
  try {
    const doctorId = req.params.id;
    const doctor = await Doctor.findById(doctorId);

    if (!doctor) {
      return res.status(404).json({ success: false, message: "Doctor not found" });
    }

    const allowedDays = [...new Set(doctor.timeSlots.map(slot => slot.day.toLowerCase()))];
    const bookings = await Booking.find({
      doctor: doctorId,
      appointmentDate: { $gte: new Date() }
    });

    // Map: date => Set of booked slots
    const bookedMap = {};
    for (const booking of bookings) {
      const dateStr = booking.appointmentDate.toISOString().split("T")[0];
      const slotKey = `${booking.timeSlot.startingTime}-${booking.timeSlot.endingTime}`;
      if (!bookedMap[dateStr]) bookedMap[dateStr] = new Set();
      bookedMap[dateStr].add(slotKey);
    }

    const result = {};
    const daysToCheck = 30;

    for (let i = 0; i < daysToCheck; i++) {
      const date = addDays(new Date(), i);
      const weekday = date.toLocaleDateString("en-US", { weekday: "long" }).toLowerCase();
      if (!allowedDays.includes(weekday)) continue;

      const dateStr = date.toISOString().split("T")[0];
      const slotsForDay = doctor.timeSlots.filter(slot =>
        slot.day.toLowerCase() === weekday && slot.isAvailable
      );

      const totalSlots = slotsForDay.map(slot =>
        `${slot.startingTime}-${slot.endingTime}`
      );

      const bookedSlots = bookedMap[dateStr] || new Set();

      if (bookedSlots.size >= totalSlots.length) {
        result[dateStr] = "fully booked";
      } else if (bookedSlots.size > 0) {
        result[dateStr] = [...bookedSlots];
      } else {
        result[dateStr] = [];
      }
    }

    return res.status(200).json({
      success: true,
      blocked: result
    });

  } catch (err) {
    console.error("Error in getBlockedDatesWithSlots:", err.message);
    return res.status(500).json({ success: false, message: "Failed to get blocked date/slots" });
  }
};
export const getAvailableSlotsByDoctorId = async (req, res) => {
  try {
    const doctorId = req.params.id;
    const { date } = req.body;

    if (!date) {
      return res.status(400).json({ success: false, message: "Date is required" });
    }

    const doctor = await Doctor.findById(doctorId);
    if (!doctor) {
      return res.status(404).json({ success: false, message: "Doctor not found" });
    }

    const appointmentDate = new Date(date);
    const weekday = appointmentDate.toLocaleDateString("en-US", {
      weekday: "long"
    }).toLowerCase();

    // Get all available slots for the given day
    let availableSlots = doctor.timeSlots
      .filter(slot => slot.day.toLowerCase() === weekday && slot.isAvailable)
      .map(slot => ({
        startingTime: slot.startingTime,
        endingTime: slot.endingTime
      }));

    // Get already booked slots for that date
    const bookings = await Booking.find({
      doctor: doctorId,
      appointmentDate: {
        $gte: new Date(appointmentDate.setHours(0, 0, 0, 0)),
        $lt: new Date(appointmentDate.setHours(23, 59, 59, 999))
      }
    });

    const bookedSlots = new Set(
      bookings.map(
        (b) => `${b.timeSlot.startingTime}-${b.timeSlot.endingTime}`
      )
    );

    // Filter out booked slots
    availableSlots = availableSlots.filter(
      slot => !bookedSlots.has(`${slot.startingTime}-${slot.endingTime}`)
    );

    return res.status(200).json({
      success: true,
      availableSlots
    });

  } catch (err) {
    console.error("Error in getAvailableSlotsByDoctorId:", err.message);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};
