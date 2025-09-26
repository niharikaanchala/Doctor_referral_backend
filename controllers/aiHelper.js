// controllers/aiHelper.js
import Booking from "../models/BookingSchema.js";
import { analyzeWithGemini } from "../utils/gemini.js";

export const analyzeAndStore = async (bookingId) => {
    const booking = await Booking.findById(bookingId)
        .populate("user")
        .populate("doctor");

    if (!booking) throw new Error("Booking not found");
    const user = booking.user;
    const reports = booking.currentReports || [];
    const healthIssues = booking.currentHealthIssues || "";

    const aiInput = {
        user: {
            name: user.name,
            age: user.age,
            gender: user.gender,
            bp: user.bp,
            diabetic: user.diabetic,
            hyperthyroidism: user.hyperthyroidism
        },
        reports,
        healthIssues,
    };

    const analysis = await analyzeWithGemini(aiInput);
    booking.aiAnalysis = analysis;
    await booking.save();
    return analysis;
};
