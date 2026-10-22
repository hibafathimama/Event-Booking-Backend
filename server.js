const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
require("dotenv").config();

const connectDB = require("./config/connectDB");
const userRoutes = require("./routes/userRoutes");
const eventRoutes = require("./routes/eventRoutes");
const bookingRoutes = require("./routes/bookingRoutes");
const adminRoutes = require("./routes/adminRoutes");

const app = express();

app.use(
cors({
origin: "http://localhost:3000",
credentials: true,
})
);

app.use(express.json());

// Read cookies from incoming requests
app.use(cookieParser());

// Serve uploaded images
app.use("/uploads", express.static("uploads"));

app.get("/", (req, res) => {
res.send("Backend is running...");
});

// User routes
app.use("/api/users", userRoutes);

// Event routes
app.use("/api/events", eventRoutes);

// Booking routes
app.use("/api/bookings", bookingRoutes);

// Admin routes
app.use("/api/admin", adminRoutes);

connectDB();

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
console.log(`Server running on port ${PORT}`);
});
