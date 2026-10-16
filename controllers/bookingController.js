import mongoose from "mongoose";
import User from "../models/UserSchema.js";
import Doctor from "../models/DoctorSchema.js";
import Booking from "../models/BookingSchema.js";
import Stripe from "stripe";
import twilio from 'twilio';
import dotenv from "dotenv"
import { queueAnalysis } from "./aiHelper.js";

function applyQueuedAnalysis(booking, queued) {
    booking.aiStatus = "processing";
    booking.aiError = "";
    if (queued?.startedAt) booking.aiStartedAt = queued.startedAt;
}
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
            applyQueuedAnalysis(booking, await queueAnalysis(booking._id));
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
            applyQueuedAnalysis(booking, await queueAnalysis(booking._id));
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
        await booking.save();
        try {
            applyQueuedAnalysis(booking, await queueAnalysis(booking._id));
        } catch (err) {
            console.error("Failed to re-analyze booking:", err.message);
        }


        res.status(200).json({ success: true, message: "Reports updated", data: booking });
    } catch (err) {
        console.log(err.message);
        res.status(500).json({ success: false, message: "Error updating reports" });
    }
};

const normalizePrescription = ({ diagnosis = "", medicines = [], notes = "" } = {}) => {
    const cleanedMedicines = (Array.isArray(medicines) ? medicines : [])
        .filter((medicine) => medicine && String(medicine.name || "").trim())
        .map((medicine) => ({
            name: String(medicine.name).trim(),
            dosage: String(medicine.dosage || "").trim(),
            frequency: String(medicine.frequency || "").trim(),
            duration: String(medicine.duration || "").trim(),
        }));

    return {
        diagnosis: String(diagnosis || "").trim(),
        medicines: cleanedMedicines,
        notes: String(notes || "").trim(),
    };
};

const loadDoctorBooking = async (bookingId, doctorId) => {
    const booking = await Booking.findById(bookingId).populate("doctor", "_id");
    if (!booking) return { error: { status: 404, message: "Booking not found" } };
    if (booking.doctor._id.toString() !== doctorId.toString()) {
        return { error: { status: 403, message: "Not authorized" } };
    }
    if (booking.status === "completed" || booking.status === "cancelled") {
        return { error: { status: 400, message: "Booking is closed" } };
    }
    return { booking };
};

export const addPrescription = async (req, res) => {
    try {
        const { bookingId } = req.params;
        const { booking, error } = await loadDoctorBooking(bookingId, req.userId);
        if (error) return res.status(error.status).json({ success: false, message: error.message });

        const prescription = normalizePrescription(req.body);
        if (!prescription.diagnosis && prescription.medicines.length === 0) {
            return res.status(400).json({
                success: false,
                message: "Add a diagnosis or at least one medicine",
            });
        }

        booking.prescriptions.push({
            ...prescription,
            createdAt: new Date(),
        });
        booking.unreadDoctorResponses = (booking.unreadDoctorResponses || 0) + 1;

        await booking.save();

        res.status(200).json({
            success: true,
            message: "Prescription added",
            data: booking,
        });
    } catch (err) {
        console.error("Error in addPrescription:", err);
        res.status(500).json({
            success: false,
            message: "Error adding prescription",
            error: err.message,
        });
    }
};

export const updatePrescription = async (req, res) => {
    try {
        const { bookingId, prescriptionId } = req.params;
        const { booking, error } = await loadDoctorBooking(bookingId, req.userId);
        if (error) return res.status(error.status).json({ success: false, message: error.message });

        const prescription = booking.prescriptions.id(prescriptionId);
        if (!prescription) {
            return res.status(404).json({ success: false, message: "Prescription not found" });
        }

        const next = normalizePrescription(req.body);
        if (!next.diagnosis && next.medicines.length === 0) {
            return res.status(400).json({
                success: false,
                message: "Add a diagnosis or at least one medicine",
            });
        }

        prescription.diagnosis = next.diagnosis;
        prescription.medicines = next.medicines;
        prescription.notes = next.notes;
        prescription.updatedAt = new Date();
        booking.unreadDoctorResponses = (booking.unreadDoctorResponses || 0) + 1;

        await booking.save();

        res.status(200).json({
            success: true,
            message: "Prescription updated",
            data: booking,
        });
    } catch (err) {
        console.error("Error in updatePrescription:", err);
        res.status(500).json({
            success: false,
            message: "Error updating prescription",
            error: err.message,
        });
    }
};

export const addPatientMessage = async (req, res) => {
    try {
        const { bookingId } = req.params;
        const { response } = req.body;
        const userId = req.userId;

        if (!response || !String(response).trim()) {
            return res.status(400).json({ success: false, message: "Message is required" });
        }

        const booking = await Booking.findById(bookingId);
        if (!booking) {
            return res.status(404).json({ success: false, message: "Booking not found" });
        }

        if (booking.user._id.toString() !== userId.toString()) {
            return res.status(403).json({ success: false, message: "Not authorized" });
        }

        if (booking.status === "completed" || booking.status === "cancelled") {
            return res.status(400).json({ success: false, message: "This booking is closed" });
        }

        booking.patientMessages.push({
            text: String(response).trim(),
            updatedAt: new Date(),
        });
        booking.unreadPatientUpdates = (booking.unreadPatientUpdates || 0) + 1;
        await booking.save();

        res.status(200).json({
            success: true,
            message: "Message sent",
            data: booking,
        });
    } catch (err) {
        console.error("Error in addPatientMessage:", err);
        res.status(500).json({
            success: false,
            message: "Error sending message",
            error: err.message,
        });
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
const shapeVisit = (booking) => ({
    _id: booking._id,
    appointmentDate: booking.appointmentDate,
    timeSlot: booking.timeSlot,
    status: booking.status,
    complaint: booking.currentHealthIssues || "",
    prescriptions: booking.prescriptions || [],
    reports: (booking.currentReports || []).map((group) => ({
        name: group.name,
        files: group.files || [],
    })),
});

export const getPatientHistory = async (req, res) => {
    try {
        const doctorId = req.userId;
        const { patientId } = req.params;
        const exclude = req.query.exclude;

        if (!mongoose.Types.ObjectId.isValid(patientId)) {
            return res.status(400).json({ success: false, message: "Invalid patient" });
        }

        const query = {
            doctor: doctorId,
            user: patientId,
            status: { $ne: "cancelled" },
        };

        if (exclude && mongoose.Types.ObjectId.isValid(exclude)) {
            query._id = { $ne: exclude };
            const current = await Booking.findOne({ _id: exclude, doctor: doctorId }).select("appointmentDate");
            if (current?.appointmentDate) {
                query.appointmentDate = { $lt: current.appointmentDate };
            }
        }

        if (!query.appointmentDate) {
            query.appointmentDate = { $lt: new Date() };
        }

        const bookings = await Booking.find(query).sort({ appointmentDate: -1 });

        res.status(200).json({
            success: true,
            data: bookings.map(shapeVisit),
        });
    } catch (err) {
        console.error("Error in getPatientHistory:", err);
        res.status(500).json({ success: false, message: "Failed to load visit history" });
    }
};

export const getBookingDetails = async (req, res) => {
    try {
        const role = req.role;
        const { bookingId } = req.params;
        const booking = await Booking.findById(bookingId)
            .populate('user', 'name photo email phone age gender bloodType')
            .populate('doctor', 'name photo specialization');

        if (!booking) {
            return res.status(404).json({ success: false, message: "Booking not found" });
        }

        const viewedAt = new Date();
        const consolidated = consolidateReports(booking.currentReports);
        const viewedPatch = {};
        if (role === "patient") {
            booking.lastViewedByPatient = viewedAt;
            viewedPatch.lastViewedByPatient = viewedAt;
        } else if (role === "doctor") {
            booking.lastViewedByDoctor = viewedAt;
            viewedPatch.lastViewedByDoctor = viewedAt;
        }
        if (consolidated.changed) {
            booking.currentReports = consolidated.reports;
            viewedPatch.currentReports = consolidated.reports;
        }
        if (Object.keys(viewedPatch).length > 0) {
            await Booking.updateOne({ _id: bookingId }, { $set: viewedPatch });
        }

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

const CANONICAL_REPORT_NAMES = {
    xray: "X-Ray",
    mri: "MRI",
    ct: "CT Scan",
    ultrasound: "Ultrasound",
    "blood test": "Blood Test",
    lab: "Lab Report",
};

function reportTypeKey(name) {
    return String(name || "")
        .toLowerCase()
        .replace(/&/g, " and ")
        .replace(/[^a-z0-9]+/g, " ")
        .replace(/\b(scans?|reports?|images?|files?)\b/g, " ")
        .replace(/\bx\s*rays?\b/g, "xray")
        .replace(/\s+/g, " ")
        .trim();
}

function canonicalReportName(name) {
    const key = reportTypeKey(name);
    if (CANONICAL_REPORT_NAMES[key]) return CANONICAL_REPORT_NAMES[key];
    const cleaned = String(name || "")
        .replace(/\b(scans?|reports?|images?|files?)\b/gi, " ")
        .replace(/\s+/g, " ")
        .trim();
    return cleaned || String(name || "").trim();
}

function consolidateReports(reports) {
    const merged = [];
    const indexByKey = new Map();
    let changed = false;

    (reports || []).forEach((group) => {
        const originalName = group?.name || "";
        const files = Array.isArray(group?.files) ? [...group.files] : [];
        const key = reportTypeKey(originalName) || originalName.toLowerCase();
        const label = canonicalReportName(originalName) || originalName;
        const existingIndex = indexByKey.get(key);

        if (existingIndex === undefined) {
            if (label !== originalName) changed = true;
            indexByKey.set(key, merged.length);
            merged.push({ name: label, files });
            return;
        }

        changed = true;
        const target = merged[existingIndex];
        files.forEach((file) => {
            if (file && !target.files.includes(file)) target.files.push(file);
        });
    });

    if ((reports || []).length !== merged.length) changed = true;
    return { reports: merged, changed };
}

export const uploadReports = async (req, res) => {
    try {
        const { bookingId } = req.params;
        const { name, urls } = req.body; // 🧠 'name' is "Blood Report", 'urls' is array of Cloudinary links
        const userId = req.userId;

        const booking = await Booking.findById(bookingId);
        if (!booking) return res.status(404).json({ message: "Booking not found" });
        if (booking.user._id.toString() !== userId.toString()) return res.status(403).json({ message: "Unauthorized" });

        const label = canonicalReportName(name) || name;
        booking.currentReports = consolidateReports([
            ...(booking.currentReports || []).map((group) => ({
                name: group.name,
                files: [...(group.files || [])],
            })),
            { name: label, files: urls },
        ]).reports;

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
        try {
            applyQueuedAnalysis(booking, await queueAnalysis(booking._id));
        } catch (err) {
            console.error("Failed to analyze booking:", err.message);
        }

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

        const label = canonicalReportName(newName) || newName;
        booking.currentReports = consolidateReports([
            ...(booking.currentReports || [])
                .filter((item) => item.name !== oldName)
                .map((item) => ({ name: item.name, files: [...(item.files || [])] })),
            { name: label, files: [...(group.files || [])] },
        ]).reports;

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

