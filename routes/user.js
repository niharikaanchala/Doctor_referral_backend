import { updateUser , deleteUser ,getAllUser,getSingleUser, getUserProfile , getMyAppointments } from "../controllers/userController.js";
import express from "express"
import { authenticate , restrict } from "../auth/verifyToken.js";

const router = express.Router();

// router.get('/:id',authenticate, restrict(['admin']),getSingleUser)


router.get('/:id', authenticate,restrict(['patient']), getSingleUser);


router.delete('/:id',authenticate,restrict(['patient']),deleteUser)

router.put('/:id',authenticate, restrict(['patient']),updateUser)

router.get('/',authenticate,restrict(['admin']),getAllUser)
router.get('/profile/me',authenticate,restrict(['patient']),getUserProfile)
router.get('/appointments/my-appointments',authenticate,restrict(['patient']),getMyAppointments)

export default router;