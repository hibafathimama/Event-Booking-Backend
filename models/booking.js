const mongoose = require("mongoose");
const crypto = require("crypto");

const bookingSchema = new mongoose.Schema(
  {
    bookingId: {
      type: String,
      required: true,
      unique: true,
    },

    ticketToken: {
      type: String,
      unique: true,
      sparse: true,
      default: undefined,
    },

    checkedIn: {
      type: Boolean,
      default: false,
    },

    checkedInAt: {
      type: Date,
      default: null,
    },

    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    event: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Event",
      required: true,
    },

    ticketType: {
      type: String,
      required: true,
      trim: true,
    },

    quantity: {
      type: Number,
      required: true,
      min: 1,
    },
    selectedSeats: {
    type: [String],
    default: [],
  },

    totalPrice: {
      type: Number,
      required: true,
      min: 0,
    },

    status: {
      type: String,
      enum: ["pending", "confirmed", "cancelled"],
      default: "pending",
    },

    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "failed", "expired", "refunded"],
      default: "pending",
    },

    stripeSessionId: {
      type: String,
      default: null,
      index: true,
    },
    razorpayOrderId: {
    type: String,
    default: null,
    index: true,
  },

  razorpayPaymentId: {
    type: String,
    default: null,
    unique: true,
    sparse: true,
  },
  razorpayRefundId: {
  type: String,
  default: null,
},

refundAmount: {
  type: Number,
  default: 0,
},

refundStatus: {
  type: String,
  enum: [
    "not_requested",
    "pending",
    "processed",
    "failed",
  ],
  default: "not_requested",
},

refundRequestedAt: {
  type: Date,
  default: null,
},
  },
  {
    timestamps: true,
  }
);

const Booking =
  mongoose.models.Booking ||
  mongoose.model("Booking", bookingSchema);

module.exports = Booking;