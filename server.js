const express = require("express");
const cors = require("cors");
require("dotenv").config();

const connectDB = require("./config/connectDB");
const userRoutes = require("./routes/userRoutes");
const eventRoutes = require("./routes/eventRoutes");
const bookingRoutes =require ("./routes/bookingRoutes")
const adminRoutes =require("./routes/adminRoutes")

const app = express();

app.use(cors());
app.use(express.json());
app.use("/uploads", express.static("uploads"));

app.get("/", (req, res) => {
    res.send("Backend is running...");
});

// User routes
app.use("/api/users", userRoutes);
//event routes
app.use("/api/events", eventRoutes);
//booking routes
app.use("/api/bookings",bookingRoutes)
//admin routes
app.use("/api/admin",adminRoutes)

connectDB();

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});