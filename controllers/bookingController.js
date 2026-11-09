const Booking = require("../models/booking");
const Event = require("../models/event");
const { validationResult } = require("express-validator");
const Notification = require("../models/notification");
const QRCode = require("qrcode");
const crypto = require("crypto");
const razorpay = require("../config/razorpay");

const createBooking = async (req, res) => {
  try {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
      return res.status(422).json({
        status: false,
        message: errors.array()[0].msg,
      });
    }

    const { event, ticketType, quantity } = req.body;

    // 1. Validate required fields
    if (
      !event ||
      !ticketType ||
      quantity === undefined ||
      quantity === null ||
      quantity === ""
    ) {
      return res.status(400).json({
        status: false,
        message: "Event, ticket type and quantity are required",
      });
    }

    const ticketQuantity = Number(quantity);

    if (!Number.isInteger(ticketQuantity) || ticketQuantity <= 0) {
      return res.status(400).json({
        status: false,
        message: "Quantity must be a positive integer",
      });
    }

    // 2. Validate ticket type
    const normalizedTicketType = String(ticketType).toLowerCase();

    const allowedTicketTypes = ["general", "vip", "premium"];

    if (!allowedTicketTypes.includes(normalizedTicketType)) {
      return res.status(400).json({
        status: false,
        message: "Invalid ticket type",
      });
    }

    // 3. Find the active event
    const eventData = await Event.findOne({
      _id: event,
      isActive: true,
    });

    if (!eventData) {
      return res.status(404).json({
        status: false,
        message: "Event not found or is no longer available",
      });
    }

    // 4. Prevent booking past events
    const eventDateTime = new Date(
      `${new Date(eventData.date).toISOString().split("T")[0]}T${eventData.time}`
    );

    if (Number.isNaN(eventDateTime.getTime())) {
      return res.status(400).json({
        status: false,
        message: "Invalid event date or time",
      });
    }

    if (eventDateTime < new Date()) {
      return res.status(400).json({
        status: false,
        message: "Cannot book tickets for a past event",
      });
    }

    // 5. Get price based on selected ticket type
    const ticketPrice =
      eventData.ticketPrices?.[normalizedTicketType] ??
      eventData.ticketPrice;

    if (
      typeof ticketPrice !== "number" ||
      !Number.isFinite(ticketPrice) ||
      ticketPrice < 0
    ) {
      return res.status(400).json({
        status: false,
        message: "Price is not available for this ticket type",
      });
    }

    // 6. Calculate total price
    const totalPrice = ticketPrice * ticketQuantity;

    // 7. Reserve seats atomically
    const updatedEvent = await Event.findOneAndUpdate(
      {
        _id: event,
        isActive: true,
        availableSeats: { $gte: ticketQuantity },
      },
      {
        $inc: { availableSeats: -ticketQuantity },
      },
      {
        new: true,
      }
    );

    if (!updatedEvent) {
      return res.status(400).json({
        status: false,
        message: "Event is unavailable or not enough seats are available",
      });
    }

    let createdBooking = null;

    try {
      // 8. Generate booking ID and ticket token
      const bookingId = "BK" + Date.now();
      const ticketToken = crypto.randomBytes(32).toString("hex");

      // 9. Generate QR code
      const frontendUrl =
        process.env.FRONTEND_URL || "http://localhost:3000";

      const verificationUrl =
        `${frontendUrl}/organizer/verify-ticket?token=${ticketToken}`;

      const qrCode = await QRCode.toDataURL(verificationUrl);

      // 10. Save booking
      createdBooking = await Booking.create({
        bookingId,
        ticketToken,
        checkedIn: false,
        checkedInAt: null,
        user: req.user.user_id,
        event,
        ticketType: normalizedTicketType,
        quantity: ticketQuantity,
        totalPrice,
      });

      // 11. Booking confirmation notification
      try {
        await Notification.create({
          user: req.user.user_id,
          sender: null,
          type: "booking_confirmation",
          message: `Your booking for ${eventData.eventName} has been confirmed. Booking ID: ${createdBooking.bookingId}`,
        });
      } catch (notificationError) {
        console.error(
          "BOOKING NOTIFICATION ERROR:",
          notificationError
        );
      }

      // 12. Return booking details and QR code
      return res.status(201).json({
        status: true,
        message: "Booking created successfully",
        data: {
          ...createdBooking.toObject(),
          ticketPrice,
          qrCode,
        },
      });
    } catch (bookingError) {
      // Delete booking if a later step fails
      if (createdBooking) {
        await Booking.deleteOne({
          _id: createdBooking._id,
        });
      }

      // Restore reserved seats
      await Event.findByIdAndUpdate(event, {
        $inc: { availableSeats: ticketQuantity },
      });

      throw bookingError;
    }
  } catch (error) {
    console.error("CREATE BOOKING ERROR:", error);

    return res.status(500).json({
      status: false,
      message: error.message || "Booking failed",
    });
  }
};


// GET MY BOOKINGS
const getMybookings = async (req, res) => {
  try {
const bookings = await Booking.find({
  user: req.user.user_id,
})
      .populate(
        "event",
        "eventName date time venue location ticketPrice image"
      )
      .populate("user", "firstName lastName email");

    const frontendUrl =
      process.env.FRONTEND_URL || "http://localhost:3000";

    const bookingsWithQR = await Promise.all(
      bookings.map(async (booking) => {
        const bookingData = booking.toObject();

        if (booking.ticketToken) {
          const verificationUrl =
            `${frontendUrl}/organizer/verify-ticket?token=${booking.ticketToken}`;

          bookingData.qrCode = await QRCode.toDataURL(
            verificationUrl
          );
        } else {
          bookingData.qrCode = null;
        }

        return bookingData;
      })
    );

    return res.status(200).json({
      status: true,
      message: "Bookings fetched successfully",
      data: bookingsWithQR,
    });
  } catch (error) {
    console.error("GET MY BOOKINGS ERROR:", error);

    return res.status(500).json({
      status: false,
      message: error.message || "Failed to fetch bookings",
    });
  }
};


// GET ALL BOOKINGS
const getAllbookings = async (req, res) => {
  try {
    const bookings = await Booking.find()
      .populate("user", "firstName lastName email")
      .populate(
        "event",
        "eventName date time venue location ticketPrice"
      );

    return res.status(200).json({
      status: true,
      message: "All booking fetched successfully",
      data: bookings,
    });
  } catch (error) {
    console.error("GET ALL BOOKINGS ERROR:", error);

    return res.status(500).json({
      message: error.message || "Failed to fetch bookings",
    });
  }
};


// ORGANIZER BOOKINGS
const getOrganizerBookings = async (req, res) => {
  try {
    const events = await Event.find({
      organizer: req.user.user_id,
    });

    const eventIds = events.map((event) => event._id);

    const bookings = await Booking.find({
      event: { $in: eventIds },
    })
      .populate("user", "firstName lastName email")
      .populate(
        "event",
        "eventName date time venue location ticketPrice"
      );

    return res.status(200).json({
      status: true,
      message: "Organizer bookings fetched successfully",
      data: bookings,
    });
  } catch (error) {
    console.error("GET ORGANIZER BOOKINGS ERROR:", error);

    return res.status(500).json({
      message: error.message || "Failed to fetch bookings",
    });
  }
};


// CANCEL BOOKING WITH RAZORPAY REFUND

const cancelBooking = async (req, res) => {
  try {
    const { id } = req.params;

    // 1. Find booking belonging to logged-in user

    const booking = await Booking.findOne({
      _id: id,
      user: req.user.user_id,
    });

    if (!booking) {
      return res.status(404).json({
        status: false,
        message: "Booking not found",
      });
    }

    if (booking.status === "cancelled") {
      return res.status(400).json({
        status: false,
        message: "Booking is already cancelled",
      });
    }

    // 2. Prevent cancellation after ticket check-in

    if (booking.checkedIn) {
      return res.status(400).json({
        status: false,
        message: "A used ticket cannot be cancelled",
      });
    }

    // 3. Find event

    const event = await Event.findById(booking.event);

    if (!event) {
      return res.status(404).json({
        status: false,
        message: "Event not found",
      });
    }

    // 4. Prevent cancellation after event starts

    const eventDateTime = new Date(
      `${new Date(event.date).toISOString().split("T")[0]}T${event.time}`
    );

    if (eventDateTime <= new Date()) {
      return res.status(400).json({
        status: false,
        message: "This booking can no longer be cancelled",
      });
    }

    // 5. Check payment

    if (
      booking.paymentStatus !== "paid" ||
      !booking.razorpayPaymentId
    ) {
      return res.status(400).json({
        status: false,
        message: "No successful Razorpay payment found",
      });
    }

    // 6. Check existing refund request

    if (
      booking.refundStatus !== "not_requested" &&
      booking.refundStatus !== "failed"
    ) {
      return res.status(400).json({
        status: false,
        message: "A refund request is already being processed",
      });
    }

    // 7. Verify actual Razorpay payment

    const payment = await razorpay.payments.fetch(
      booking.razorpayPaymentId
    );

    if (payment.status !== "captured") {
      return res.status(400).json({
        status: false,
        message: "Payment is not captured. Refund cannot be initiated.",
      });
    }

    const expectedAmount = Math.round(
      booking.totalPrice * 100
    );

    if (payment.amount !== expectedAmount) {
      return res.status(400).json({
        status: false,
        message: "Payment amount does not match booking amount",
      });
    }

    // 8. Lock booking to prevent duplicate refund requests

    const lockedBooking = await Booking.findOneAndUpdate(
      {
        _id: booking._id,
        user: req.user.user_id,
        status: { $ne: "cancelled" },
        refundStatus: {
          $in: ["not_requested", "failed"],
        },
      },
      {
        $set: {
          refundStatus: "initiating",
          refundRequestedAt: new Date(),
        },
      },
      {
        new: true,
      }
    );

    if (!lockedBooking) {
      return res.status(409).json({
        status: false,
        message: "Booking cancellation or refund is already in progress",
      });
    }

    // 9. Request Razorpay refund

    let refund;

    try {
      refund = await razorpay.payments.refund(
        booking.razorpayPaymentId,
        {
          amount: expectedAmount,
          notes: {
            bookingId: booking.bookingId,
            reason: "User cancelled booking",
          },
        }
      );
    } catch (refundError) {
      console.error(
        "RAZORPAY REFUND ERROR:",
        refundError
      );

      // Keep status as initiating if the result is uncertain.
      // Check the Razorpay dashboard before attempting another refund.

      return res.status(500).json({
        status: false,
        message:
          "Refund could not be confirmed. Please contact support before retrying.",
      });
    }

    // 10. Validate refund response

    if (!refund || !refund.id) {
      return res.status(500).json({
        status: false,
        message: "Razorpay did not return a valid refund ID",
      });
    }

    // 11. Save refund information and cancel booking

    booking.status = "cancelled";
    booking.razorpayRefundId = refund.id;
    booking.refundAmount = expectedAmount / 100;

    booking.refundStatus =
      refund.status === "processed"
        ? "processed"
        : "pending";

    if (refund.status === "processed") {
      booking.paymentStatus = "refunded";
    }

    booking.refundRequestedAt = new Date();

    await booking.save();

    // 12. Restore event seats

    if (event.seatingType === "reserved") {
      const selectedSeats = booking.selectedSeats || [];

      if (
        selectedSeats.length !== booking.quantity ||
        new Set(selectedSeats).size !== booking.quantity
      ) {
        throw new Error(
          "Invalid selected seats. Manual seat restoration is required."
        );
      }

      const result = await Event.updateOne(
        {
          _id: event._id,

          $expr: {
            $eq: [
              {
                $size: {
                  $filter: {
                    input: "$seats",
                    as: "seat",
                    cond: {
                      $and: [
                        {
                          $in: [
                            "$$seat.seatNumber",
                            selectedSeats,
                          ],
                        },
                        {
                          $eq: [
                            "$$seat.status",
                            "booked",
                          ],
                        },
                      ],
                    },
                  },
                },
              },
              booking.quantity,
            ],
          },
        },
        {
          $set: {
            "seats.$[seat].status": "available",
            "seats.$[seat].reservationOrderId": null,
            "seats.$[seat].reservedUntil": null,
          },
          $inc: {
            availableSeats: booking.quantity,
          },
        },
        {
          arrayFilters: [
            {
              "seat.seatNumber": {
                $in: selectedSeats,
              },
              "seat.status": "booked",
            },
          ],
        }
      );

      if (result.modifiedCount !== 1) {
        throw new Error(
          "Reserved seats could not be restored. Manual correction is required."
        );
      }
    } else if (event.seatingType === "general") {
      await Event.findByIdAndUpdate(event._id, {
        $inc: {
          availableSeats: booking.quantity,
        },
      });
    }

    // 13. Send cancellation notification

    try {
      await Notification.create({
        user: req.user.user_id,
        sender: null,
        type: "booking_cancellation",
        message:
          `Your booking ${booking.bookingId} has been cancelled. ` +
          `Refund status: ${booking.refundStatus}.`,
      });
    } catch (notificationError) {
      console.error(
        "CANCELLATION NOTIFICATION ERROR:",
        notificationError
      );
    }

    // 14. Return response

    return res.status(200).json({
      status: true,
      message: "Booking cancelled and refund initiated successfully",

      data: {
        bookingId: booking.bookingId,
        status: booking.status,
        paymentStatus: booking.paymentStatus,
        refundId: booking.razorpayRefundId,
        refundAmount: booking.refundAmount,
        refundStatus: booking.refundStatus,
      },
    });

  } catch (error) {
    console.error("CANCEL BOOKING ERROR:", error);

    return res.status(500).json({
      status: false,
      message:
        error.message || "Failed to cancel booking",
    });
  }
};


// GET BOOKING BY ID FOR USER TICKET
const getBookingById = async (req, res) => {
  try {
    const { id } = req.params;

    const booking = await Booking.findOne({
      _id: id,
      user: req.user.user_id,
    })
      .populate(
        "event",
        "eventName date time venue location ticketPrice image"
      )
      .populate("user", "firstName lastName email");

    if (!booking) {
      return res.status(404).json({
        status: false,
        message: "Booking not found",
      });
    }

    let qrCode = null;

    if (booking.ticketToken) {
      const frontendUrl =
        process.env.FRONTEND_URL || "http://localhost:3000";

      const verificationUrl =
        `${frontendUrl}/organizer/verify-ticket?token=${booking.ticketToken}`;

      qrCode = await QRCode.toDataURL(verificationUrl);
    }

    const bookingData = booking.toObject();

    bookingData.qrCode = qrCode;

    return res.status(200).json({
      status: true,
      message: "Booking fetched successfully",
      data: bookingData,
    });
  } catch (error) {
    console.error("GET BOOKING BY ID ERROR:", error);

    return res.status(500).json({
      status: false,
      message: error.message || "Failed to fetch booking",
    });
  }
};


// GET ORGANIZER BOOKING DETAILS
const getOrganizerBookingById = async (req, res) => {
  try {
    const { id } = req.params;

    const booking = await Booking.findById(id)
      .populate(
        "event",
        "eventName date time venue location ticketPrice image organizer"
      )
      .populate("user", "firstName lastName email");

    if (!booking) {
      return res.status(404).json({
        status: false,
        message: "Booking not found",
      });
    }

    if (!booking.event) {
      return res.status(404).json({
        status: false,
        message: "Event not found",
      });
    }

    if (
      booking.event.organizer.toString() !==
      req.user.user_id.toString()
    ) {
      return res.status(403).json({
        status: false,
        message: "You are not authorized to view this booking",
      });
    }

    return res.status(200).json({
      status: true,
      message: "Booking details fetched successfully",
      data: booking,
    });
  } catch (error) {
    console.error("GET ORGANIZER BOOKING DETAILS ERROR:", error);

    return res.status(500).json({
      status: false,
      message: error.message || "Failed to fetch booking details",
    });
  }
};


// VERIFY TICKET
const verifyTicket = async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        status: false,
        message: "Ticket token is required",
      });
    }

    const booking = await Booking.findOne({
      ticketToken: token,
    })
      .populate("event", "eventName date time venue organizer")
      .populate("user", "firstName lastName email");

    if (!booking) {
      return res.status(404).json({
        status: false,
        message: "Invalid ticket",
      });
    }

    if (booking.status !== "confirmed") {
      return res.status(400).json({
        status: false,
        message: "This booking is cancelled or invalid",
      });
    }

    if (!booking.event) {
      return res.status(404).json({
        status: false,
        message: "Event not found",
      });
    }

    if (
      booking.event.organizer.toString() !==
      req.user.user_id.toString()
    ) {
      return res.status(403).json({
        status: false,
        message: "You are not authorized to verify this ticket",
      });
    }

    if (booking.checkedIn) {
      return res.status(400).json({
        status: false,
        message: "Ticket has already been used",
        data: {
          bookingId: booking.bookingId,
          checkedInAt: booking.checkedInAt,
        },
      });
    }

    booking.checkedIn = true;
    booking.checkedInAt = new Date();

    await booking.save();

    return res.status(200).json({
      status: true,
      message: "Ticket verified successfully",
      data: {
        bookingId: booking.bookingId,
        customerName: booking.user
          ? `${booking.user.firstName || ""} ${
              booking.user.lastName || ""
            }`.trim()
          : "Unknown customer",
        eventName: booking.event.eventName,
        quantity: booking.quantity,
        checkedIn: booking.checkedIn,
        checkedInAt: booking.checkedInAt,
      },
    });
  } catch (error) {
    console.error("VERIFY TICKET ERROR:", error);

    return res.status(500).json({
      status: false,
      message: "Failed to verify ticket",
    });
  }
};


module.exports = {
  createBooking,
  getMybookings,
  getAllbookings,
  cancelBooking,
  getOrganizerBookings,
  getBookingById,
  getOrganizerBookingById,
  verifyTicket,
};