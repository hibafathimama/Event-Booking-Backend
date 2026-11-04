const razorpay = require("../config/razorpay");
const crypto = require("crypto");
const Event = require("../models/event");
const Booking = require("../models/booking");
const QRCode = require("qrcode");

const createRazorpayOrder = async (req, res) => {
  try {
    const { eventId, quantity, ticketType, selectedSeats = [] } = req.body;

    // Validate basic booking details
    if (
      !eventId ||
      !ticketType ||
      !Number.isInteger(quantity) ||
      quantity <= 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Event, ticket type and a valid quantity are required.",
      });
    }

    // Find event
    const eventData = await Event.findOne({
      _id: eventId,
      isActive: true,
    });

    if (!eventData) {
      return res.status(404).json({
        success: false,
        message: "Event not found or unavailable.",
      });
    }

    // Validate seating type and selected seats
    if (eventData.seatingType === "reserved") {
      if (
        !Array.isArray(selectedSeats) ||
        selectedSeats.length !== quantity ||
        new Set(selectedSeats).size !== quantity ||
        selectedSeats.some(
          (seat) => typeof seat !== "string" || !seat.trim()
        )
      ) {
        return res.status(400).json({
          success: false,
          message: "Please select a valid number of unique seats.",
        });
      }
    } else if (eventData.seatingType === "general") {
      if (
        !Array.isArray(selectedSeats) ||
        selectedSeats.length > 0
      ) {
        return res.status(400).json({
          success: false,
          message: "Seat selection is not available for this event.",
        });
      }
    } else {
      return res.status(400).json({
        success: false,
        message: "Invalid event seating type.",
      });
    }

    // Validate ticket price
    if (
      !Number.isFinite(eventData.ticketPrice) ||
      eventData.ticketPrice <= 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid event price.",
      });
    }

    // Check available seats
    if (eventData.availableSeats < quantity) {
      return res.status(400).json({
        success: false,
        message: "Not enough seats are available.",
      });
    }

    // Validate event date and time
    const eventDateTime = new Date(
      `${new Date(eventData.date).toISOString().split("T")[0]}T${eventData.time}`
    );

    if (
      Number.isNaN(eventDateTime.getTime()) ||
      eventDateTime < new Date()
    ) {
      return res.status(400).json({
        success: false,
        message: "This event cannot be booked.",
      });
    }

    // Calculate payment amount
    const totalPrice = eventData.ticketPrice * quantity;
    const amountInPaise = Math.round(totalPrice * 100);

    if (
      !Number.isSafeInteger(amountInPaise) ||
      amountInPaise <= 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid booking amount.",
      });
    }

    // Create Razorpay order
    const order = await razorpay.orders.create({
      amount: amountInPaise,
      currency: "INR",
      receipt: `receipt_${Date.now()}`,
      notes: {
        eventId: String(eventData._id),
        quantity: String(quantity),
        ticketType,
        userId: String(req.user.user_id),
        selectedSeats: JSON.stringify(selectedSeats),
      },
    });

    // Reserve selected seats for 10 minutes
    if (eventData.seatingType === "reserved") {
      const reservedUntil = new Date(Date.now() + 10 * 60 * 1000);

      const reservedEvent = await Event.findOneAndUpdate(
        {
          _id: eventId,
          isActive: true,
          seatingType: "reserved",
          availableSeats: { $gte: quantity },

          // All requested seats must currently be available
          $expr: {
            $eq: [
              {
                $size: {
                  $filter: {
                    input: "$seats",
                    as: "seat",
                    cond: {
                      $and: [
                        { $in: ["$$seat.seatNumber", selectedSeats] },
                        { $eq: ["$$seat.status", "available"] },
                      ],
                    },
                  },
                },
              },
              quantity,
            ],
          },
        },
        [
          {
            $set: {
              seats: {
                $map: {
                  input: "$seats",
                  as: "seat",
                  in: {
                    $cond: [
                      { $in: ["$$seat.seatNumber", selectedSeats] },
                      {
                        $mergeObjects: [
                          "$$seat",
                          {
                            status: "reserved",
                            reservationOrderId: order.id,
                            reservedUntil: reservedUntil,
                          },
                        ],
                      },
                      "$$seat",
                    ],
                  },
                },
              },
              availableSeats: {
                $subtract: ["$availableSeats", quantity],
              },
            },
          },
        ],
        {
          new: true,
          updatePipeline: true,
        }
      );

      if (!reservedEvent) {
        return res.status(409).json({
          success: false,
          message:
            "One or more selected seats are no longer available. Please select again.",
        });
      }
    }

    return res.status(201).json({
      success: true,
      message: "Razorpay order created successfully.",
      data: {
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        keyId: process.env.RAZORPAY_KEY_ID,
      },
    });
  } catch (error) {
    console.error("Razorpay order creation failed:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to create payment order.",
    });
  }
};

const verifyRazorpayPayment = async (req, res) => {
  let reservedEventId = null;
  let reservedQuantity = 0;
  let reservedSeatNumbers = [];
  let reservedOrderId = null;
  let isReservedSeating = false;
  let bookingCreated = false;

  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    } = req.body;

    // 1. Validate payment details
    if (
      !razorpay_order_id ||
      !razorpay_payment_id ||
      !razorpay_signature
    ) {
      return res.status(400).json({
        success: false,
        message: "Missing payment verification details.",
      });
    }

    if (
      typeof razorpay_order_id !== "string" ||
      typeof razorpay_payment_id !== "string" ||
      typeof razorpay_signature !== "string" ||
      !/^[a-f0-9]{64}$/i.test(razorpay_signature)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment verification details.",
      });
    }

    // 2. Verify Razorpay signature
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    const signatureBuffer = Buffer.from(razorpay_signature, "hex");
    const expectedBuffer = Buffer.from(expectedSignature, "hex");

    const isValid =
      signatureBuffer.length === expectedBuffer.length &&
      crypto.timingSafeEqual(signatureBuffer, expectedBuffer);

    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: "Payment verification failed.",
      });
    }

    // 3. Fetch actual order and payment from Razorpay
    const [order, payment] = await Promise.all([
      razorpay.orders.fetch(razorpay_order_id),
      razorpay.payments.fetch(razorpay_payment_id),
    ]);

    if (
      order.id !== razorpay_order_id ||
      payment.order_id !== razorpay_order_id
    ) {
      return res.status(400).json({
        success: false,
        message: "Payment does not match the order.",
      });
    }

    if (payment.status !== "captured") {
      return res.status(400).json({
        success: false,
        message: "Payment is not captured yet.",
      });
    }

    if (
      order.currency !== "INR" ||
      payment.currency !== order.currency ||
      payment.amount !== order.amount ||
      order.amount <= 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Payment amount or currency does not match.",
      });
    }

    // 4. Check order ownership
    const notes = order.notes || {};

    if (notes.userId !== String(req.user.user_id)) {
      return res.status(403).json({
        success: false,
        message: "This payment order does not belong to your account.",
      });
    }

    const eventId = notes.eventId;
    const quantity = Number(notes.quantity);
    const ticketType = notes.ticketType;

    let selectedSeats = [];

    try {
      selectedSeats = notes.selectedSeats
        ? JSON.parse(notes.selectedSeats)
        : [];
    } catch {
      return res.status(400).json({
        success: false,
        message: "Invalid selected seat details.",
      });
    }

    if (
      !eventId ||
      !Number.isInteger(quantity) ||
      quantity <= 0 ||
      !ticketType ||
      !Array.isArray(selectedSeats)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid booking details in the payment order.",
      });
    }

    // 5. Prevent duplicate bookings
    const existingBooking = await Booking.findOne({
      $or: [
        { razorpayPaymentId: razorpay_payment_id },
        { razorpayOrderId: razorpay_order_id },
      ],
    });

    if (existingBooking) {
      if (
        String(existingBooking.user) !== String(req.user.user_id) ||
        existingBooking.razorpayPaymentId !== razorpay_payment_id ||
        existingBooking.paymentStatus !== "paid"
      ) {
        return res.status(409).json({
          success: false,
          message: "This payment order has already been processed.",
        });
      }

      return res.status(200).json({
        success: true,
        message: "Booking already confirmed.",
        data: {
          bookingId: existingBooking.bookingId,
          status: existingBooking.status,
          paymentStatus: existingBooking.paymentStatus,
          ticketToken: existingBooking.ticketToken,
        },
      });
    }

    // 6. Find event
    const eventData = await Event.findOne({
      _id: eventId,
      isActive: true,
    });

    if (!eventData) {
      return res.status(400).json({
        success: false,
        message: "The event is no longer available.",
      });
    }

    // 7. Validate payment amount
    const expectedAmount = Math.round(
      eventData.ticketPrice * quantity * 100
    );

    if (
      !Number.isSafeInteger(expectedAmount) ||
      expectedAmount !== order.amount
    ) {
      return res.status(400).json({
        success: false,
        message: "The payment amount does not match the booking price.",
      });
    }

    // 8. Handle reserved seating
    if (eventData.seatingType === "reserved") {
      if (
        selectedSeats.length !== quantity ||
        new Set(selectedSeats).size !== quantity ||
        selectedSeats.some(
          (seat) => typeof seat !== "string" || !seat.trim()
        )
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid selected seats.",
        });
      }

      // Confirm seats are reserved for this Razorpay order.
      // Change reserved seats to booked.
      const bookedEvent = await Event.findOneAndUpdate(
        {
          _id: eventId,
          isActive: true,
          seatingType: "reserved",
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
                            "reserved",
                          ],
                        },
                        {
                          $eq: [
                            "$$seat.reservationOrderId",
                            razorpay_order_id,
                          ],
                        },
                        {
                          $gt: [
                            "$$seat.reservedUntil",
                            new Date(),
                          ],
                        },
                      ],
                    },
                  },
                },
              },
              quantity,
            ],
          },
        },
        [
          {
            $set: {
              seats: {
                $map: {
                  input: "$seats",
                  as: "seat",
                  in: {
                    $cond: [
                      {
                        $in: [
                          "$$seat.seatNumber",
                          selectedSeats,
                        ],
                      },
                      {
                        $mergeObjects: [
                          "$$seat",
                          {
                            status: "booked",
                            reservationOrderId: null,
                            reservedUntil: null,
                          },
                        ],
                      },
                      "$$seat",
                    ],
                  },
                },
              },
            },
          },
        ],
        {
          returnDocument: "after",
          updatePipeline: true,
        }
      );

      if (!bookedEvent) {
        return res.status(409).json({
          success: false,
          message:
            "Your seat reservation has expired or is no longer available. Your payment needs to be checked by support.",
        });
      }

      reservedEventId = eventId;
      reservedQuantity = quantity;
      reservedSeatNumbers = selectedSeats;
      reservedOrderId = razorpay_order_id;
      isReservedSeating = true;

    } else if (eventData.seatingType === "general") {

      if (selectedSeats.length > 0) {
        return res.status(400).json({
          success: false,
          message: "Invalid seat details for general admission.",
        });
      }

      // General admission: decrease available seats after payment.
      const updatedEvent = await Event.findOneAndUpdate(
        {
          _id: eventId,
          isActive: true,
          seatingType: "general",
          availableSeats: { $gte: quantity },
        },
        {
          $inc: { availableSeats: -quantity },
        },
        {
          returnDocument: "after",
        }
      );

      if (!updatedEvent) {
        return res.status(409).json({
          success: false,
          message:
            "Not enough seats are available. Contact support about your payment.",
        });
      }

      reservedEventId = eventId;
      reservedQuantity = quantity;

    } else {
      return res.status(400).json({
        success: false,
        message: "Invalid event seating type.",
      });
    }

    // 9. Generate ticket details
    const ticketToken = crypto.randomBytes(24).toString("hex");

    const bookingId = `BK${Date.now()}${crypto
      .randomBytes(3)
      .toString("hex")}`;

    const frontendUrl =
      process.env.FRONTEND_URL || "http://localhost:3000";

    const verificationUrl =
      `${frontendUrl}/organizer/verify-ticket?token=${ticketToken}`;

    const qrCode = await QRCode.toDataURL(verificationUrl);

    // 10. Create booking
    const booking = await Booking.create({
      bookingId,
      ticketToken,
      checkedIn: false,
      user: req.user.user_id,
      event: eventId,
      ticketType,
      quantity,
      selectedSeats,
      totalPrice: expectedAmount / 100,
      status: "confirmed",
      paymentStatus: "paid",
      razorpayOrderId: razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
    });

    bookingCreated = true;

    // 11. Return booking confirmation
    return res.status(201).json({
      success: true,
      message: "Payment verified and booking confirmed successfully.",
      data: {
        bookingId: booking.bookingId,
        ticketToken: booking.ticketToken,
        quantity: booking.quantity,
        selectedSeats: booking.selectedSeats,
        totalPrice: booking.totalPrice,
        status: booking.status,
        paymentStatus: booking.paymentStatus,
        qrCode,
      },
    });

  } catch (error) {

    // 12. Roll back if booking creation fails
    if (reservedEventId && reservedQuantity > 0 && !bookingCreated) {
      try {
        if (isReservedSeating) {
          await Event.updateOne(
            {
              _id: reservedEventId,
              "seats.seatNumber": { $in: reservedSeatNumbers },
            },
            {
              $set: {
                "seats.$[seat].status": "reserved",
                "seats.$[seat].reservationOrderId": reservedOrderId,
              },
            },
            {
              arrayFilters: [
                {
                  "seat.seatNumber": { $in: reservedSeatNumbers },
                  "seat.status": "booked",
                },
              ],
            }
          );

        } else {
          await Event.updateOne(
            { _id: reservedEventId },
            { $inc: { availableSeats: reservedQuantity } }
          );
        }

      } catch (rollbackError) {
        console.error(
          "Failed to restore seats:",
          rollbackError.message
        );
      }
    }

    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message:
          "This payment may already have been processed. Check My Bookings before retrying.",
      });
    }

    console.error("Payment verification error:", error);

    return res.status(500).json({
      success: false,
      message:
        "Unable to finish booking verification. Check My Bookings before retrying.",
    });
  }
};

const releaseExpiredReservations = async () => {
  const now = new Date();

  const events = await Event.find({
    seatingType: "reserved",
    seats: {
      $elemMatch: {
        status: "reserved",
        reservedUntil: { $lte: now },
      },
    },
  });

  let releasedCount = 0;

  for (const event of events) {
    const expiredSeats = event.seats.filter(
      (seat) =>
        seat.status === "reserved" &&
        seat.reservedUntil &&
        seat.reservedUntil <= now
    );

    if (expiredSeats.length === 0) continue;

    const expiredSeatNumbers = expiredSeats.map(
      (seat) => seat.seatNumber
    );

    const result = await Event.updateOne(
      {
        _id: event._id,
      },
      {
        $set: {
          "seats.$[seat].status": "available",
          "seats.$[seat].reservationOrderId": null,
          "seats.$[seat].reservedUntil": null,
        },
        $inc: {
          availableSeats: expiredSeatNumbers.length,
        },
      },
      {
        arrayFilters: [
          {
            "seat.seatNumber": { $in: expiredSeatNumbers },
            "seat.status": "reserved",
            "seat.reservedUntil": { $lte: now },
          },
        ],
      }
    );

    if (result.modifiedCount > 0) {
      releasedCount += expiredSeatNumbers.length;
    }
  }

  if (releasedCount > 0) {
    console.log(`${releasedCount} expired seats released.`);
  }

  return releasedCount;
};

module.exports = {
  createRazorpayOrder,
  verifyRazorpayPayment,
  releaseExpiredReservations
};