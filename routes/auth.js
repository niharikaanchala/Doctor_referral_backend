import express from "express";

import { register, login, createReceptionist,
  getReceptionists,
  deleteReceptionist,
  updateReceptionist,getReceptionistProfile } from "../controllers/authController.js";
import { authenticate, restrict } from "../auth/verifyToken.js";

const router = express.Router();

router.post('/register' , register);
router.post('/login' ,login);
// GET all receptionists
router.post('/addreceptionist',authenticate, restrict(["doctor"]) ,createReceptionist);
router.get("/receptionists", authenticate, restrict(["doctor"]), getReceptionists);
router.get("/profile/me", authenticate, getReceptionistProfile);

router.delete("/receptionists/:id", authenticate, restrict(["doctor"]), deleteReceptionist);
router.put("/receptionists", authenticate, updateReceptionist);

export default router;
