import mongoose from "mongoose";



const healthIssueUpdateSchema = new mongoose.Schema({
  text: { type: String, required: true },
  updatedAt: { type: Date, default: Date.now }
});

const reportUpdateSchema = new mongoose.Schema({
  name: String,
  action: { type: String, enum: ["added", "removed"], required: true },
  reportUrl: { type: String },
  updatedAt: { type: Date, default: Date.now }
});

const doctorResponseSchema = new mongoose.Schema({
  text: { type: String, required: true },
  updatedAt: { type: Date, default: Date.now }
});

const bookingSchema = new mongoose.Schema({
  doctor: {
    type: mongoose.Types.ObjectId,
    ref: "Doctor",
    required: true,
  },
  user: {
    type: mongoose.Types.ObjectId,
    ref: "User",
    required: true,
  },
  ticketPrice: { type: String, required: true },
  appointmentDate: { type: Date, required: true },
  timeSlot: {
    day: { type: String, required: true },
    startingTime: { type: String, required: true },
    endingTime: { type: String, required: true },
  },
  currentHealthIssues: { type: String },
  healthIssuesHistory: [healthIssueUpdateSchema],
  currentReports: [
    {
      name: { type: String, required: true },
      files: [String]
    }
  ],
  reportsHistory: [reportUpdateSchema],
  doctorResponses: [doctorResponseSchema],
  status: {
    type: String,
    enum: ["pending", "approved", "cancelled", "completed"],
    default: "pending",
  },
  isPaid: {
    type: Boolean,
    default: false,
  },
  unreadDoctorResponses: {
    type: Number,
    default: 0,
  },
  unreadPatientUpdates: {
    type: Number,
    default: 0,
  },
  lastViewedByDoctor: { type: Date },
  lastViewedByPatient: { type: Date },
  aiAnalysis: {
    type: Object, // or type: mongoose.Schema.Types.Mixed
    default: null,
  },
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Add pre-save hook to update doctor's availability

bookingSchema.pre('save', async function (next) {
  if ((this.isNew && this.isPaid) ||
    (this.isModified('status') && (this.status === 'completed' || this.status === 'cancelled'))) {
    const doctor = await mongoose.model('Doctor').findById(this.doctor);
    if (doctor) {
      doctor.timeSlots = doctor.timeSlots.map(slot => {
        if (slot.day === this.timeSlot.day &&
          slot.startingTime === this.timeSlot.startingTime &&
          slot.endingTime === this.timeSlot.endingTime) {
          return { ...slot.toObject(), isAvailable: false };
        }
        return slot;
      });
      await doctor.save();
    }
  }
  next();
});

bookingSchema.pre(/^find/, function (next) {
  this.populate('user').populate({
    path: 'doctor',
    select: 'name photo specialization'
  });
  next();
});

export default mongoose.model("Booking", bookingSchema);