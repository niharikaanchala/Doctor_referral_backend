// import jwt from "jsonwebtoken"
// import Doctor from "../models/DoctorSchema.js";
// import User from "../models/UserSchema.js"

// export const authenticate = async (req, res, next) => {
//     // Get token from headers
//     const authToken = req.headers.authorization;

//     // Check if token exists
//     if (!authToken || !authToken.startsWith('Bearer ')) {
//         return res.status(401).json({ success: false, message: "No token, authorization denied" });
//     }

//     try {
//         // Remove the "Bearer " prefix from the token
//         const token = authToken.split(' ')[1];

//         // Verify the token and get the user information from the payload
//         const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY);
//         req.userId = decoded.userId;

//         req.role = decoded.role;    

//         // Call the next middleware
//         next();
//     } catch (error) {
//         console.error(error.message);
//         if(error.name ==='TokenExpiredError'){
//             return res.status(401).json({message:"Token is already Expired"});
//         }
//         res.status(401).json({ success: false, message: "Invalid token" });
//     }
// };




// export const restrict = (roles) => async (req, res, next) => {
//     try {
//         const userId = req.userId;
//         const role = req.role;

//         // Log the userId to ensure it's being passed correctly
//         console.log(`User ID from request: ${userId}`);

//         let user;

//         // Fetch user based on the role
//         if (role === 'doctor') {
//             user = await Doctor.findById(userId);
//         } else if (role === 'patient') {
//             user = await User.findById(userId);
//         } else {
//             return res.status(401).json({ success: false, message: "Invalid role" });
//         }

//         if (!user) {
//             return res.status(401).json({ success: false, message: "User not found" });
//         }

//         // Attach the user to the request object
//         req.user = user;

//         // Log the user role
//         console.log(`User role: ${user.role}`);

//         if (!roles.includes(user.role)) {
//             return res.status(403).json({ success: false, message: "You're not authorized" });
//         }

//         next();
//     } catch (error) {
//         console.error("Error in restrict middleware:", error);
//         return res.status(500).json({ success: false, message: "Internal server error" });
//     }
// }

import jwt from "jsonwebtoken"
import Doctor from "../models/DoctorSchema.js";
import User from "../models/UserSchema.js"

export const authenticate = async (req, res, next) => {
    // Get token from headers
    const authToken = req.headers.authorization;

    // Check if token exists
    if (!authToken || !authToken.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, message: "No token, authorization denied" });
    }

    try {
        // Remove the "Bearer " prefix from the token
        const token = authToken.split(' ')[1];

        // Verify the token and get the user information from the payload
        const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY);
        req.userId = decoded.id;
        req.role = decoded.role;

        

        // Call the next middleware
        next();
    } catch (error) {
        console.error(error.message);
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ message: "Token is already Expired" });
        }
        res.status(401).json({ success: false, message: "Invalid token" });
    }
};

export const restrict = (roles) => async (req, res, next) => {
    try {
        const userId = req.userId;
        const role = req.role;

        
        let user;

        // Fetch user based on the role
        if (role === 'patient') {
            user = await User.findById(userId);
        } else if (role === 'doctor') {
            user = await Doctor.findById(userId);
        }

        if (!user || !roles.includes(user.role)) {
            return res.status(403).json({ success: false, message: "You're not authorized" });
        }

        next();
    } catch (error) {
        console.error("Error in restrict middleware:", error);
        return res.status(500).json({ success: false, message: "Internal server error" });
    }
}
// In verifyToken.js

// export const restrict = (roles) => async (req, res, next) => {
//     try {
//         const userId = req.userId;
//         const role = req.role;
//         const doctorId = req.doctorId; 

//         // Fetch user based on the role
//         let user;
//         if (role === 'doctor') {
//             user = await Doctor.findById(doctorId);
//         } if (role === 'patient') {
//             user = await User.findById(userId);
//         }

//         if (!user) {
//             console.log(`User not found for ID: ${userId} and role: ${role}`);
//             return res.status(401).json({ success: false, message: "User not found" });
//         }

//         // Attach the user to the request object
//         req.user = user;

//         // Check if user role is allowed to perform action
//         if (!roles.includes(user.role)) {
//             return res.status(403).json({ success: false, message: "You're not authorized" });
//         }

//         next();
//     } catch (error) {
//         console.error("Error in restrict middleware:", error);
//         return res.status(500).json({ success: false, message: "Internal server error" });
//     }
// }

