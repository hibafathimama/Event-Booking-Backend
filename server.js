const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
require("dotenv").config();
const path = require("path");
const http = require("http");
const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");

const connectDB = require("./config/connectDB");
const userRoutes = require("./routes/userRoutes");
const eventRoutes = require("./routes/eventRoutes");
const bookingRoutes = require("./routes/bookingRoutes");
const adminRoutes = require("./routes/adminRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const paymentRoutes = require("./routes/paymentRoutes");
const favoriteRoutes = require("./routes/favoriteRoutes");
const messageRoutes = require("./routes/messageRoutes");


const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: [
      "http://localhost:3000",
      "https://gather-frontend-b37d.vercel.app",
    ],
    credentials: true,
  },
});

app.set("io", io);
io.use((socket, next) => {
  try {
    const token = socket.handshake.auth.token;

    if (!token) {
      return next(new Error("Authentication required"));
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    socket.user = {
      user_id: decoded.user_id,
      role: decoded.role,
    };

    next();
  } catch (error) {
    next(new Error("Invalid or expired token"));
  }
});

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
  });
});



app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "https://gather-frontend-b37d.vercel.app",
    ],
    credentials: true,
  })
);


// Stripe webhook must receive the raw request body.
app.use(
  "/api/payments/webhook",
  express.raw({ type: "application/json" }),
  require("./controllers/paymentWebhookController").handleStripeWebhook
);

// Parse JSON for all other routes.
app.use(express.json());


// Read cookies from incoming requests
app.use(cookieParser());

// Serve uploaded images
app.use(
  "/uploads",
  express.static(path.join(__dirname, "uploads"))
);

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

// Notification routes
app.use("/api/notifications", notificationRoutes);

//payment routes
app.use("/api/payments", paymentRoutes);

app.use("/api/payments", require("./routes/razorpayRoutes"));

//wishlist routes
app.use("/api/favorites", favoriteRoutes);

app.use("/api/messages", messageRoutes);

connectDB();

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});