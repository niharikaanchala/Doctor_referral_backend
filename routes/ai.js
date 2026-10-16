import express from "express";
import Booking from "../models/BookingSchema.js";
import { queueAnalysis } from "../controllers/aiHelper.js";

const router = express.Router();

function publicStatus(booking) {
    if (booking.aiStatus === "processing" || booking.aiStatus === "failed") return booking.aiStatus;
    if (booking.aiStatus === "ready" || booking.aiAnalysis) return "ready";
    return "idle";
}

router.get("/status/:bookingId", async (req, res) => {
    try {
        const booking = await Booking.findById(req.params.bookingId).select("aiStatus aiStartedAt aiError aiAnalysis");
        if (!booking) {
            return res.status(404).json({ success: false, message: "Booking not found" });
        }

        const status = publicStatus(booking);
        return res.status(200).json({
            success: true,
            status,
            startedAt: booking.aiStartedAt,
            error: booking.aiError || "",
            analysis: status === "ready" ? booking.aiAnalysis : null,
        });
    } catch (error) {
        console.error("AI status error:", error);
        return res.status(500).json({ success: false, message: "Could not check analysis" });
    }
});

router.post("/analyze", async (req, res) => {
    const { bookingId } = req.body;

    try {
        const result = await queueAnalysis(bookingId);
        return res.status(200).json({ success: true, status: result.status });
    } catch (error) {
        console.error("AI analysis error:", error);
        return res.status(500).json({ message: "AI analysis failed" });
    }
});

export default router;
