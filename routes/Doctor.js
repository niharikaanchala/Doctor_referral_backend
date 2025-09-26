import { deleteDoctor, updateDoctor, getAllDoctor, getSingleDoctor, getDoctorProfile, getAvailableDates, filterDoctorAppointments, getAvailableSlots, cancelAppointments, getBlockedDates, getBlockedDatesWithSlots, getAvailableSlotsByDoctorId } from "../controllers/doctorController.js";
import { authenticate, restrict } from "../auth/verifyToken.js";
import reviewRouter from './review.js'
import express from "express"

const router = express.Router();

router.use("/:doctorId/reviews", reviewRouter);

router.get("/:id/blocked-dates-with-slots", getBlockedDatesWithSlots);

router.get('/:id/blocked-dates', authenticate, restrict(["patient"]), getBlockedDates);
router.get('/:id', getSingleDoctor)
router.get("/:id/available-dates", authenticate, restrict(["patient", "doctor"]), getAvailableDates);
router.delete('/:id', restrict(['doctor']), deleteDoctor)
router.post("/:id/available-slots", getAvailableSlotsByDoctorId);

router.put('/:id', authenticate, restrict(['doctor']), updateDoctor)

router.get('/', getAllDoctor)
// Filter appointments by date and/or time slot
router.get('/appointments/filter', authenticate, restrict(['doctor']), filterDoctorAppointments);
router.post('/appointments/cancel-slot', authenticate, restrict(['doctor']), cancelAppointments);
// GET all slots for selected date (unfiltered)
// router.post('/:id/all-slots', authenticate, restrict(['doctor']), getAllSlotsForDate);

// GET only available (unbooked) slots for booking
router.post('/available-slots', authenticate, restrict(['doctor']), getAvailableSlots);

router.get('/profile/me', authenticate, restrict(['doctor']), getDoctorProfile)

export default router;