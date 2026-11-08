const mongoose = require("mongoose");

// =====================================================
// GENERAL ADMISSION RESERVATION SCHEMA
// =====================================================

const generalReservationSchema = new mongoose.Schema(
  {
    orderId: {
      type: String,
      required: true,
    },

    quantity: {
      type: Number,
      required: true,
      min: 1,
    },

    reservedUntil: {
      type: Date,
      required: true,
    },
  },
  {
    _id: false,
  }
);

// =====================================================
// RESERVED SEAT SCHEMA
// =====================================================

const seatSchema = new mongoose.Schema(
  {
    seatNumber: {
      type: String,
      required: true,
      trim: true,
    },

    status: {
      type: String,
      enum: ["available", "reserved", "booked"],
      default: "available",
    },

    reservationOrderId: {
      type: String,
      default: null,
    },

    reservedUntil: {
      type: Date,
      default: null,
    },
  },
  {
    _id: false,
  }
);

// =====================================================
// EVENT SCHEMA
// =====================================================

const eventSchema = new mongoose.Schema(
  {
    eventName: {
      type: String,
      required: true,
      trim: true,
    },

    category: {
      type: String,
      required: true,
      trim: true,
    },

    date: {
      type: Date,
      required: true,
    },

    time: {
      type: String,
      required: true,
    },

    venue: {
      type: String,
      required: true,
      trim: true,
    },

    location: {
      type: String,
      required: true,
      trim: true,
    },

    description: {
      type: String,
      required: true,
      trim: true,
    },

    ticketPrice: {
      type: Number,
      required: true,
      min: 0,
    },

    totalSeats: {
      type: Number,
      required: true,
      min: 1,
    },

    availableSeats: {
      type: Number,
      required: true,
      min: 0,
    },

    seatingType: {
      type: String,
      enum: ["general", "reserved"],
      default: "general",
    },

    // Individual seats for reserved seating
    seats: {
      type: [seatSchema],
      default: [],
    },

    // Temporary reservations for general admission
    generalReservations: {
      type: [generalReservationSchema],
      default: [],
    },

    image: {
      type: String,
      default: null,
    },

    organizer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

const Event = mongoose.model("Event", eventSchema);

module.exports = Event;
