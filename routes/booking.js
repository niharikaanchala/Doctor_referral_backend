import express from 'express';
import { authenticate, restrict } from "../auth/verifyToken.js";
import {
    getCheckoutSession,
    handleSuccessfulPayment,
    updateHealthIssues,
    updateReports,
    addDoctorResponse,
    getBookingDetails,
    resetUnreadCounters,
    updateBookingStatus,
    uploadReports,
    renameReportGroup,
    deleteReportGroup,
    removeFileFromGroup,
    resetUnreadBatch
} from '../controllers/bookingController.js';

const router = express.Router();

router.post('/checkout-success/:doctorId', authenticate, getCheckoutSession);
router.get('/payment-success', handleSuccessfulPayment);
router.get('/:bookingId', authenticate, getBookingDetails);
router.put('/:bookingId/health-issues', authenticate, restrict('patient'), updateHealthIssues);
router.put('/:bookingId/reports', authenticate, restrict('patient'), updateReports);
router.post('/:bookingId/doctor-response', authenticate, restrict('doctor'), addDoctorResponse);
router.put('/:bookingId/reset-unread', authenticate, resetUnreadCounters);
router.post(
    '/:bookingId/reports/save',
    authenticate,
    restrict('patient'),
    uploadReports
);
router.put('/:bookingId/reports/:oldName', authenticate, restrict('patient'), renameReportGroup);
router.delete('/:bookingId/reports/:groupName', authenticate, restrict('patient'), deleteReportGroup);
router.put('/:bookingId/reports/:groupName/remove-file', authenticate, restrict('patient'), removeFileFromGroup);
router.put('/reset-unread-batch', authenticate, resetUnreadBatch);



// Add new route
router.put('/:bookingId/status', authenticate, restrict('doctor'), updateBookingStatus);
export default router;