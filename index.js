import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import mongoose from "mongoose";
import dotenv from "dotenv";
import authRoute from "./routes/auth.js"
import userRoute from "./routes/user.js"
import doctorRoute from "./routes/Doctor.js"
import reviewRoute from "./routes/review.js"
import bookingRoute from "./routes/booking.js"
import ai from "./routes/ai.js"
dotenv.config();

const app = express();

const port = process.env.PORT || 8000;

const corsOptions = {
    origin: [
        "https://doctor-appointments-using-mern-stack.vercel.app",
        "https://doctor-appointments-using-mern-stack-ub19.vercel.app",
        // Include any other frontend URLs you might be using
        "http://localhost:3000"
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
};
app.get('/', (req, res) => {
    res.send("api is working");
})

//database

mongoose.set('strictQuery', false)
const connectDB = async () => {
    try {
        mongoose.connect(process.env.MONGO_URL)
        console.log("database is connected : ", process.env.MONGO_URL);
    } catch (error) {
        console.log("Connection error in database")
    }
}

//middle ware

app.use(express.json())
app.use(cookieParser())
app.use(cors());
app.use('/api/auth', authRoute);
app.use('/api/users', userRoute);
app.use('/api/doctors', doctorRoute);
app.use('/api/reviews', reviewRoute);
app.use('/api/bookings', bookingRoute);
app.use('/api/ai', ai);

app.listen(port, () => {
    connectDB();
    console.log("Server is running on port " + port)
})