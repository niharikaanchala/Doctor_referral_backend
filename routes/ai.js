// routes/ai.js
import express from "express";
import Booking from "../models/BookingSchema.js";
import User from "../models/UserSchema.js";
import { analyzeWithGemini } from "../utils/gemini.js"; // We’ll create this function

const router = express.Router();

router.post("/analyze", async (req, res) => {
    const { bookingId } = req.body;

    try {
        const booking = await Booking.findById(bookingId)
            .populate("user")
            .populate("doctor");

        if (!booking) {
            return res.status(404).json({ message: "Booking not found" });
        }

        const user = booking.user;
        const reports = booking.currentReports || [];
        const healthIssues = booking.currentHealthIssues || "";

        // Construct input for Gemini
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

        const aiResult = await analyzeWithGemini(aiInput);
        booking.aiAnalysis = aiResult;
        await booking.save();

        return res.status(200).json({ success: true, analysis: aiResult });
    } catch (error) {
        console.error("AI analysis error:", error);
        return res.status(500).json({ message: "AI analysis failed" });
    }
});

export default router;
