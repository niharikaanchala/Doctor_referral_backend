import Booking from "../models/BookingSchema.js";
import { analyzeWithGemini } from "../utils/gemini.js";

const STALE_MS = 4 * 60 * 1000;

export const queueAnalysis = async (bookingId) => {
    const cutoff = new Date(Date.now() - STALE_MS);
    const startedAt = new Date();

    const claim = await Booking.updateOne(
        {
            _id: bookingId,
            $or: [
                { aiStatus: { $in: ["idle", "ready", "failed", null] } },
                { aiStatus: { $exists: false } },
                { aiStartedAt: { $lte: cutoff } },
                { aiStartedAt: null },
            ],
        },
        {
            $set: {
                aiStatus: "processing",
                aiStartedAt: startedAt,
                aiError: "",
            },
        }
    );

    if (claim.matchedCount === 0) {
        const exists = await Booking.exists({ _id: bookingId });
        if (!exists) throw new Error("Booking not found");
        return { status: "processing" };
    }

    runAnalysis(bookingId, startedAt).catch((err) => {
        console.error("Failed to analyze booking:", err.message);
    });

    return { status: "processing", startedAt };
};

async function runAnalysis(bookingId, startedAt) {
    try {
        const booking = await Booking.findById(bookingId);
        if (!booking) return;

        const user = booking.user || {};
        const analysis = await analyzeWithGemini({
            user: {
                name: user.name,
                age: user.age,
                gender: user.gender,
                bp: user.bp,
                diabetic: user.diabetic,
                hyperthyroidism: user.hyperthyroidism,
            },
            reports: booking.currentReports || [],
            healthIssues: booking.currentHealthIssues || "",
        });

        await Booking.updateOne(
            { _id: bookingId, aiStartedAt: startedAt },
            { $set: { aiAnalysis: analysis, aiStatus: "ready", aiError: "" } }
        );
    } catch (err) {
        console.error("Failed to analyze booking:", err.message);
        await Booking.updateOne(
            { _id: bookingId, aiStartedAt: startedAt },
            {
                $set: {
                    aiStatus: "failed",
                    aiError: "Analysis didn't finish. You can try again.",
                },
            }
        );
    }
}
