import User from "../models/UserSchema.js";
import Doctor from "../models/DoctorSchema.js";
import Booking from "../models/BookingSchema.js";
import Stripe from "stripe";
import twilio from 'twilio';
import dotenv from "dotenv"
import { analyzeAndStore } from "./aiHelper.js";
dotenv.config()
// console.log("acc sid ", process.env.TWILIO_ACCOUNT_SID)
// console.log("acc auth ", process.env.TWILIO_AUTH_TOKEN)
// console.log("acc phone ", process.env.TWILIO_PHONE_NUMBER)



export const getCheckoutSession = async (req, res) => {
    try {
        const doctor = await Doctor.findById(req.params.doctorId);
        const user = await User.findById(req.userId);

        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

        const allReportUrls = req.body.groupedReports?.flatMap(group => group.files) || [];
        const existingBooking = await Booking.findOne({
            doctor: doctor._id,
            appointmentDate: req.body.appointmentDate,
            'timeSlot.day': req.body.timeSlot.day,
            'timeSlot.startingTime': req.body.timeSlot.startingTime,
            'timeSlot.endingTime': req.body.timeSlot.endingTime,
            status: { $ne: 'cancelled' }
        });

        if (existingBooking) {
            return res.status(400).json({
                success: false,
                message: 'This time slot is already booked. Please choose another.'
            });
        }

        const booking = new Booking({
            doctor: doctor._id,
            user: user._id,
            ticketPrice: doctor.ticketPrice,
            appointmentDate: req.body.appointmentDate,
            timeSlot: req.body.timeSlot,
            currentHealthIssues: req.body.healthIssues,
            healthIssuesHistory: [{
                text: req.body.healthIssues,
                updatedAt: new Date()
            }],
            currentReports: req.body.groupedReports,
            reportsHistory: allReportUrls.map(url => ({
                action: "added",
                reportUrl: url,
                updatedAt: new Date()
            })),
            isPaid: false
        });


        await booking.save();

        // Create Stripe session
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            mode: 'payment',
            success_url: `${process.env.CLIENT_SITE_URL}/checkout-success?bookingId=${booking._id}`,
            cancel_url: `${req.protocol}://${req.get('host')}/doctors/${doctor.id}`,
            customer_email: user.email,
            client_reference_id: booking._id.toString(),
            line_items: [
                {
                    price_data: {
                        currency: 'usd',
                        unit_amount: doctor.ticketPrice * 100,
                        product_data: {
                            name: doctor.name,
                            description: doctor.bio,
                            images: [doctor.photo]
                        }
                    },
                    quantity: 1
                },
                ...(req.body.reports && req.body.reports.length > 0 ? [{
                    price_data: {
                        currency: 'usd',
                        unit_amount: 0, // Free for reports
                        product_data: {
                            name: 'Medical Reports',
                            description: 'Uploaded medical reports for consultation',
                            images: req.body.reports.slice(0, 3) // Show first 3 reports as images
                        }
                    },
                    quantity: 1
                }] : []),
                ...(req.body.healthIssues ? [{
                    price_data: {
                        currency: 'usd',
                        unit_amount: 0, // Free for health issues
                        product_data: {
                            name: 'Health Issues',
                            description: req.body.healthIssues.substring(0, 100) + (req.body.healthIssues.length > 100 ? '...' : ''),
                        }
                    },
                    quantity: 1
                }] : [])
            ]
        });

        // Update booking with session ID
        booking.session = session.id;
        await booking.save();

        res.status(200).json({ success: true, message: 'Payment session created', session });
    } catch (err) {
        console.log(err);
        res.status(500).json({ success: false, message: "Error creating check out session" });
    }
};


export const handleSuccessfulPayment = async (req, res) => {

    const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    console.log("acc sid ", process.env.TWILIO_ACCOUNT_SID)
    console.log("acc auth ", process.env.TWILIO_AUTH_TOKEN)
    try {
        const booking = await Booking.findById(req.query.bookingId).populate('user');

        if (!booking) {
            return res.status(404).json({ success: false, message: "Booking not found" });
        }

        booking.isPaid = true;
        booking.status = "approved";
        await booking.save();

        try {
            await analyzeAndStore(booking._id);
        } catch (err) {
            console.error("Failed to analyze booking:", err.message);
        }

        // Update Doctor's time slot
        const doctor = await Doctor.findById(booking.doctor);
        // if (doctor) {
        //     doctor.timeSlots = doctor.timeSlots.map(slot => {
        //         if (
        //             slot.day === booking.timeSlot.day &&
        //             slot.startingTime === booking.timeSlot.startingTime &&
        //             slot.endingTime === booking.timeSlot.endingTime
        //         ) {
        //             return { ...slot.toObject(), isAvailable: false };
        //         }
        //         return slot;
        //     });

        //     doctor.appointments.push(booking._id);
        //     await doctor.save();
        // }
        doctor.appointments.push(booking._id);
        await doctor.save();
        const user = await User.findById(booking.user);
        // if (user) {
        //     const { phone, name: userName } = user;
        //     const { day, startingTime, endingTime } = booking.timeSlot;

        //     if (phone) {
        //         const phoneStr = String(phone);
        //         const formattedPhone = phoneStr.startsWith('+') ? phoneStr : `+91${phoneStr}`;


        //         // const messageBody = `Hi ${userName}, your booking is confirmed for ${day} from ${startingTime} to ${endingTime}.`;
        //         const messageBody =
        //             `Hi, ${userName}, your appointment with Dr. ${doctor.name} is confirmed on ${day} from ${startingTime} to ${endingTime}. Your reference number is ${booking._id}. Please visit and register 15 minutes prior to your appointment time. This appointment is valid on payment. For any queries call 04045674567 (24 hrs).\n\n` +
        //             `📞 Contact for support: https://medicare.com/support\n` +
        //             `❌ Cancel appointment: https://medicare.com/cancel/${booking._id}`;

        //         try {
        //             await twilioClient.messages.create({
        //                 body: messageBody,
        //                 from: process.env.TWILIO_PHONE_NUMBER,
        //                 to: formattedPhone
        //             });
        //             console.log("📩 SMS sent successfully to", formattedPhone);
        //         } catch (smsError) {
        //             // res.status(500).json({ success: false, message: "Error processing payment" });
        //             console.error("❌ Failed to send SMS:", smsError.message);
        //         }
        //     } else {
        //         // res.status(500).json({ success: false, message: "user phone number not specifed" });
        //         console.warn("⚠️ User phone number not found.");
        //     }
        // }




        res.status(200).json({ success: true, message: "Payment successful" });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ success: false, message: "Error processing payment" });
    }
};

export const updateHealthIssues = async (req, res) => {
    try {
        const { bookingId } = req.params;
        const { healthIssues } = req.body;
        const userId = req.userId;

        const booking = await Booking.findById(bookingId);
        if (!booking) {
            return res.status(404).json({ success: false, message: "Booking not found" });
        }

        if (booking.user._id.toString() !== userId.toString()) {
            return res.status(403).json({ success: false, message: "Not authorized" });
        }

        booking.currentHealthIssues = healthIssues;
        booking.healthIssuesHistory.push({
            text: healthIssues,
            updatedAt: new Date()
        });

        booking.unreadPatientUpdates = (booking.unreadPatientUpdates || 0) + 1;
        await booking.save();
        try {
            await analyzeAndStore(booking._id);
        } catch (err) {
            console.error("Failed to re-analyze booking:", err.message);
        }


        res.status(200).json({ success: true, message: "Health issues updated", data: booking });
    } catch (err) {
        console.log(err.message);
        res.status(500).json({ success: false, message: "Error updating health issues" });
    }
};

export const updateReports = async (req, res) => {
    try {
        const { bookingId } = req.params;
        const { action, reportUrl } = req.body;
        const userId = req.userId;

        const booking = await Booking.findById(bookingId);
        console.log(booking)
        if (!booking) {
            return res.status(404).json({ success: false, message: "Booking not found" });
        }

        if (booking.user._id.toString() !== userId.toString()) {
            return res.status(403).json({ success: false, message: "Not authorized" });
        }

        if (action === "add") {
            booking.currentReports.push(reportUrl);
            booking.reportsHistory.push({
                action: "added",
                reportUrl,
                updatedAt: new Date()
            });
        } else if (action === "remove") {
            booking.currentReports = booking.currentReports.filter(url => url !== reportUrl);
            booking.reportsHistory.push({
                action: "removed",
                reportUrl,
                updatedAt: new Date()
            });
        }
        booking.unreadPatientUpdates = (booking.unreadPatientUpdates || 0) + 1;
        try {
            await analyzeAndStore(booking._id);
        } catch (err) {
            console.error("Failed to re-analyze booking:", err.message);
        }
        await booking.save();


        res.status(200).json({ success: true, message: "Reports updated", data: booking });
    } catch (err) {
        console.log(err.message);
        res.status(500).json({ success: false, message: "Error updating reports" });
    }
};

export const addDoctorResponse = async (req, res) => {
    try {
        const { bookingId } = req.params;
        const { response } = req.body;
        const doctorId = req.userId;

        // Find booking and populate doctor
        const booking = await Booking.findById(bookingId)
            .populate('doctor', '_id');

        if (!booking) {
            return res.status(404).json({ success: false, message: "Booking not found" });
        }

        // Check authorization - compare ObjectIds properly
        if (booking.doctor._id.toString() !== doctorId.toString()) {
            return res.status(403).json({ success: false, message: "Not authorized" });
        }

        booking.unreadDoctorResponses = (booking.unreadDoctorResponses || 0) + 1;
        // Add response and increment counter
        booking.doctorResponses.push({
            text: response,
            updatedAt: new Date()
        });

        await booking.save();
        // const savedBooking = await booking.save();

        console.log('Saved booking:', booking);

        res.status(200).json({
            success: true,
            message: "Response added",
            data: booking
        });
    } catch (err) {
        console.error("Error in addDoctorResponse:", err);
        res.status(500).json({
            success: false,
            message: "Error adding response",
            error: err.message
        });
    }
};
// Update getBookingDetails:
export const getBookingDetails = async (req, res) => {
    try {
        const role = req.role;
        const { bookingId } = req.params;
        const booking = await Booking.findById(bookingId)
            .populate('user', 'name photo')
            .populate('doctor', 'name photo');

        if (!booking) {
            return res.status(404).json({ success: false, message: "Booking not found" });
        }

        // Update last viewed timestamp
        if (role === "patient") {
            booking.lastViewedByPatient = new Date();
        } else if (role === "doctor") {
            booking.lastViewedByDoctor = new Date();
        }
        await booking.save();

        res.status(200).json({ success: true, data: booking });
    } catch (err) {
        console.log(err);
        res.status(500).json({ success: false, message: "Error fetching booking details" });
    }
};

// Update resetUnreadCounters:
export const resetUnreadCounters = async (req, res) => {
    try {
        const { bookingId } = req.params;
        const { type } = req.body;
        const booking = await Booking.findById(bookingId);

        if (!booking) {
            return res.status(404).json({ success: false, message: "Booking not found" });
        }

        if (type === 'responses') {
            booking.unreadDoctorResponses = 0;
            booking.lastViewedByPatient = new Date();
        } else if (type === 'updates') {
            booking.unreadPatientUpdates = 0;
            booking.lastViewedByDoctor = new Date();
        }

        await booking.save();
        res.status(200).json({ success: true, message: "Unread counters updated" });
    } catch (err) {
        console.log(err.message);
        res.status(500).json({ success: false, message: "Error updating unread counters" });
    }
};

export const updateBookingStatus = async (req, res) => {
    try {
        const { bookingId } = req.params;
        const { status } = req.body;
        const doctorId = req.userId;

        const booking = await Booking.findById(bookingId);
        if (!booking) {
            return res.status(404).json({ success: false, message: "Booking not found" });
        }

        // Verify the doctor owns this booking
        if (booking.doctor._id.toString() !== doctorId.toString()) {
            return res.status(403).json({ success: false, message: "Not authorized" });
        }

        booking.status = status;
        await booking.save();

        // Update doctor's time slot availability if status is completed or cancelled
        if (status === 'completed' || status === 'cancelled') {
            const doctor = await Doctor.findById(booking.doctor);
            if (doctor) {
                doctor.timeSlots = doctor.timeSlots.map(slot => {
                    if (slot.day === booking.timeSlot.day &&
                        slot.startingTime === booking.timeSlot.startingTime &&
                        slot.endingTime === booking.timeSlot.endingTime) {
                        return { ...slot.toObject(), isAvailable: true };
                    }
                    return slot;
                });
                await doctor.save();
            }
        }

        res.status(200).json({ success: true, message: "Booking status updated", data: booking });
    } catch (err) {
        console.log(err);
        res.status(500).json({ success: false, message: "Error updating booking status" });
    }
};

export const uploadReports = async (req, res) => {
    try {
        const { bookingId } = req.params;
        const { name, urls } = req.body; // 🧠 'name' is "Blood Report", 'urls' is array of Cloudinary links
        const userId = req.userId;

        const booking = await Booking.findById(bookingId);
        if (!booking) return res.status(404).json({ message: "Booking not found" });
        if (booking.user._id.toString() !== userId.toString()) return res.status(403).json({ message: "Unauthorized" });

        let group = booking.currentReports.find(r => r.name === name);
        if (group) {
            group.files.push(...urls);
        } else {
            booking.currentReports.push({ name, files: urls });
        }

        // Add to reportsHistory
        urls.forEach(url => {
            booking.reportsHistory.push({
                name,
                action: "added",
                reportUrl: url,
                updatedAt: new Date()
            });
        });

        booking.unreadPatientUpdates = (booking.unreadPatientUpdates || 0) + 1;
        await booking.save();

        res.status(200).json({ success: true, message: "Reports saved", data: booking });
    } catch (err) {
        console.error("Save error:", err);
        res.status(500).json({ success: false, message: "Failed to save reports" });
    }
};

export const renameReportGroup = async (req, res) => {
    try {
        const { bookingId, oldName } = req.params;
        const { newName } = req.body;
        const userId = req.userId;

        const booking = await Booking.findById(bookingId);
        if (!booking) return res.status(404).json({ message: "Booking not found" });
        if (booking.user._id.toString() !== userId.toString()) return res.status(403).json({ message: "Unauthorized" });

        const group = booking.currentReports.find(g => g.name === oldName);
        if (!group) return res.status(404).json({ message: "Group not found" });

        group.name = newName;

        await booking.save();
        res.status(200).json({ success: true, message: "Group name updated", data: booking });
    } catch (err) {
        console.error("Rename error:", err);
        res.status(500).json({ success: false, message: "Failed to rename group" });
    }
};
export const deleteReportGroup = async (req, res) => {
    try {
        const { bookingId, groupName } = req.params;
        const userId = req.userId;

        const booking = await Booking.findById(bookingId);
        if (!booking) return res.status(404).json({ message: "Booking not found" });
        if (booking.user._id.toString() !== userId.toString()) return res.status(403).json({ message: "Unauthorized" });

        booking.currentReports = booking.currentReports.filter(g => g.name !== groupName);

        booking.reportsHistory.push({
            name: groupName,
            action: "removed",
            updatedAt: new Date()
        });

        await booking.save();
        res.status(200).json({ success: true, message: "Group deleted", data: booking });
    } catch (err) {
        console.error("Delete group error:", err);
        res.status(500).json({ success: false, message: "Failed to delete group" });
    }
};
export const removeFileFromGroup = async (req, res) => {
    try {
        const { bookingId, groupName } = req.params;
        const { fileUrl } = req.body;
        const userId = req.userId;

        const booking = await Booking.findById(bookingId);
        if (!booking) return res.status(404).json({ message: "Booking not found" });
        if (booking.user._id.toString() !== userId.toString()) return res.status(403).json({ message: "Unauthorized" });

        const group = booking.currentReports.find(g => g.name === groupName);
        if (!group) return res.status(404).json({ message: "Group not found" });

        group.files = group.files.filter(f => f !== fileUrl);

        booking.reportsHistory.push({
            name: groupName,
            action: "removed",
            reportUrl: fileUrl,
            updatedAt: new Date()
        });

        await booking.save();
        res.status(200).json({ success: true, message: "File removed", data: booking });
    } catch (err) {
        console.error("Remove file error:", err);
        res.status(500).json({ success: false, message: "Failed to remove file from group" });
    }
};

export const resetUnreadBatch = async (req, res) => {
    const { bookingIds } = req.body;
    const role = req.role;

    if (!Array.isArray(bookingIds) || bookingIds.length === 0) {
        return res.status(400).json({ success: false, message: "Invalid or empty bookingIds" });
    }

    try {
        const update = {};
        if (role === "doctor") {
            update.lastViewedByDoctor = new Date();
            update.unreadPatientUpdates = 0;
        } else if (role === "patient") {
            update.lastViewedByPatient = new Date();
            update.unreadDoctorResponses = 0;
        } else {
            return res.status(403).json({ success: false, message: "Unauthorized role" });
        }

        await Booking.updateMany(
            { _id: { $in: bookingIds } },
            { $set: update }
        );

        res.status(200).json({ success: true, message: "Unread counters reset in batch" });
    } catch (err) {
        console.error("Batch reset error:", err);
        res.status(500).json({ success: false, message: "Failed to reset unread counters in batch" });
    }
};

