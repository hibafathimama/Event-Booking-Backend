const mongoose = require("mongoose");

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
{ _id: false }
);

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

ticketPrices: {
  general: {
    type: Number,
    required: true,
    min: 0,
  },
  vip: {
    type: Number,
    required: true,
    min: 0,
  },
  premium: {
    type: Number,
    required: true,
    min: 0,
  },
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

// General admission or reserved seating
seatingType: {
  type: String,
  enum: ["general", "reserved"],
  default: "general",
},

// Individual seats for reserved events
seats: {
  type: [seatSchema],
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
