const razorpay = require("../config/razorpay");
const crypto = require("crypto");

const Event = require("../models/event");
const Booking = require("../models/booking");

const QRCode = require("qrcode");

// Reservation duration: 10 minutes
const RESERVATION_DURATION = 10 * 60 * 1000;


// =====================================================
// CREATE RAZORPAY ORDER
// =====================================================

const createRazorpayOrder = async (req, res) => {
  try {
    const {
      eventId,
      quantity,
      selectedSeats = [],
    } = req.body;

    // 1. Validate booking details

    if (
      !eventId ||
      !Number.isInteger(quantity) ||
      quantity <= 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Event and a valid quantity are required.",
      });
    }

    // 2. Find event

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

    // 3. Validate ticket price

    const eventPrice = Number(eventData.ticketPrice);

    if (
      eventData.ticketPrice === undefined ||
      eventData.ticketPrice === null ||
      eventData.ticketPrice === "" ||
      !Number.isFinite(eventPrice) ||
      eventPrice <= 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid event ticket price.",
      });
    }

    // 4. Validate selected seats

    if (eventData.seatingType === "reserved") {
      if (
        !Array.isArray(selectedSeats) ||
        selectedSeats.length !== quantity ||
        new Set(selectedSeats).size !== quantity ||
        selectedSeats.some(
          (seat) =>
            typeof seat !== "string" ||
            !seat.trim()
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

    // 5. Check available seats

    const availableSeats = Number(eventData.availableSeats);

    if (
      !Number.isFinite(availableSeats) ||
      availableSeats < quantity
    ) {
      return res.status(400).json({
        success: false,
        message: "Not enough seats are available.",
      });
    }

    // 6. Validate event date and time

    const eventDate = new Date(eventData.date);

    const [hours, minutes] = eventData.time
      .split(":")
      .map(Number);

    if (
      Number.isNaN(eventDate.getTime()) ||
      !Number.isInteger(hours) ||
      !Number.isInteger(minutes) ||
      hours < 0 ||
      hours > 23 ||
      minutes < 0 ||
      minutes > 59
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid event date or time.",
      });
    }

    const eventDateTime = new Date(eventDate);

    eventDateTime.setHours(hours, minutes, 0, 0);

    if (eventDateTime < new Date()) {
      return res.status(400).json({
        success: false,
        message: "This event cannot be booked.",
      });
    }

    // 7. Calculate payment amount

    const totalPrice = eventPrice * quantity;

    const amountInPaise = Math.round(
      totalPrice * 100
    );

    if (
      !Number.isSafeInteger(amountInPaise) ||
      amountInPaise <= 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid booking amount.",
      });
    }

    // 8. Create Razorpay order

    const order = await razorpay.orders.create({
      amount: amountInPaise,
      currency: "INR",
      receipt: `receipt_${Date.now()}`,

      notes: {
        eventId: String(eventData._id),
        quantity: String(quantity),
        userId: String(req.user.user_id),
        selectedSeats: JSON.stringify(selectedSeats),
      },
    });

    // 9. Reserve seats for 10 minutes

    const reservedUntil = new Date(
      Date.now() + RESERVATION_DURATION
    );

    // =================================================
    // RESERVED SEATING
    // =================================================

    if (eventData.seatingType === "reserved") {
      const reservedEvent = await Event.findOneAndUpdate(
        {
          _id: eventId,
          isActive: true,
          seatingType: "reserved",

          availableSeats: {
            $gte: quantity,
          },

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
                            "available",
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
                            status: "reserved",
                            reservationOrderId: order.id,
                            reservedUntil,
                          },
                        ],
                      },

                      "$$seat",
                    ],
                  },
                },
              },

              availableSeats: {
                $subtract: [
                  "$availableSeats",
                  quantity,
                ],
              },
            },
          },
        ],

        {

  returnDocument: "after",
  updatePipeline: true,
        }
      );

      if (!reservedEvent) {
        console.log(
          "Reserved seating failed:",
          {
            eventId,
            quantity,
            selectedSeats,
          }
        );

        return res.status(409).json({
          success: false,
          message:
            "One or more selected seats are no longer available. Please select again.",
        });
      }
    }

    // =================================================
    // GENERAL ADMISSION
    // =================================================

    else if (eventData.seatingType === "general") {

      // Fetch latest event information for debugging

      const debugEvent = await Event.findById(
        eventId
      ).lean();

      console.log(
        "========== GENERAL RESERVATION DEBUG =========="
      );

      console.log("Event ID:", eventId);

      console.log(
        "Event found:",
        !!debugEvent
      );

      console.log(
        "Event name:",
        debugEvent?.eventName
      );

      console.log(
        "Seating type:",
        debugEvent?.seatingType
      );

      console.log(
        "Is active:",
        debugEvent?.isActive
      );

      console.log(
        "Available seats:",
        debugEvent?.availableSeats
      );

      console.log(
        "Available seats type:",
        typeof debugEvent?.availableSeats
      );

      console.log(
        "Requested quantity:",
        quantity
      );

      console.log(
        "General reservations:",
        debugEvent?.generalReservations
      );

      console.log(
        "================================================"
      );

      // Check latest event data

      if (!debugEvent) {
        return res.status(404).json({
          success: false,
          message: "Event not found.",
        });
      }

      if (debugEvent.isActive !== true) {
        return res.status(400).json({
          success: false,
          message: "This event is currently unavailable.",
        });
      }

      if (debugEvent.seatingType !== "general") {
        return res.status(400).json({
          success: false,
          message: "This event does not support general admission.",
        });
      }

      const latestAvailableSeats = Number(
        debugEvent.availableSeats
      );

      if (
        !Number.isFinite(latestAvailableSeats) ||
        latestAvailableSeats < quantity
      ) {
        return res.status(409).json({
          success: false,
          message: `Only ${Number.isFinite(latestAvailableSeats) ? latestAvailableSeats : 0} seats are available.`,
        });
      }

      // Atomically reserve general admission seats

      const reservedEvent = await Event.findOneAndUpdate(
        {
          _id: eventId,
          isActive: true,
          seatingType: "general",

          availableSeats: {
            $gte: quantity,
          },
        },

        {
          $inc: {
            availableSeats: -quantity,
          },

          $push: {
            generalReservations: {
              orderId: order.id,
              quantity,
              reservedUntil,
            },
          },
        },

        {
          returnDocument: "after",
          runValidators: true,
        }
      );

      if (!reservedEvent) {
        console.log(
          "GENERAL ADMISSION ATOMIC UPDATE FAILED"
        );

        console.log({
          eventId,
          quantity,
          seatingType: debugEvent.seatingType,
          isActive: debugEvent.isActive,
          availableSeats: debugEvent.availableSeats,
        });

        return res.status(409).json({
          success: false,
          message:
            "The event availability changed while processing your booking. Please refresh and try again.",
        });
      }

      console.log(
        "GENERAL ADMISSION RESERVED SUCCESSFULLY"
      );

      console.log(
        "Remaining seats:",
        reservedEvent.availableSeats
      );
    }

    // 10. Return successful response

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
    console.error(
      "Razorpay order creation failed:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Unable to create payment order.",
    });
  }
};


// =====================================================
// VERIFY RAZORPAY PAYMENT
// =====================================================

const verifyRazorpayPayment = async (req, res) => {
  let reservedEventId = null;
  let reservedQuantity = 0;

  let reservedSeatNumbers = [];

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
      .createHmac(
        "sha256",
        process.env.RAZORPAY_KEY_SECRET
      )
      .update(
        `${razorpay_order_id}|${razorpay_payment_id}`
      )
      .digest("hex");

    const signatureBuffer = Buffer.from(
      razorpay_signature,
      "hex"
    );

    const expectedBuffer = Buffer.from(
      expectedSignature,
      "hex"
    );

    const isValid =
      signatureBuffer.length === expectedBuffer.length &&
      crypto.timingSafeEqual(
        signatureBuffer,
        expectedBuffer
      );

    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: "Payment verification failed.",
      });
    }

    // 3. Fetch actual order and payment

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

    if (
      notes.userId !== String(req.user.user_id)
    ) {
      return res.status(403).json({
        success: false,
        message:
          "This payment order does not belong to your account.",
      });
    }

    const eventId = notes.eventId;

    const quantity = Number(notes.quantity);

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
      !Array.isArray(selectedSeats)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid booking details in the payment order.",
      });
    }

    // 5. Prevent duplicate bookings

    const existingBooking = await Booking.findOne({
      $or: [
        {
          razorpayPaymentId: razorpay_payment_id,
        },
        {
          razorpayOrderId: razorpay_order_id,
        },
      ],
    });

    if (existingBooking) {
      if (
        String(existingBooking.user) !==
          String(req.user.user_id) ||
        existingBooking.razorpayPaymentId !==
          razorpay_payment_id ||
        existingBooking.paymentStatus !== "paid"
      ) {
        return res.status(409).json({
          success: false,
          message:
            "This payment order has already been processed.",
        });
      }

      const existingFrontendUrl =
        process.env.FRONTEND_URL ||
        "http://localhost:3000";

      const existingQrCode = await QRCode.toDataURL(
        `${existingFrontendUrl}/organizer/verify-ticket?token=${existingBooking.ticketToken}`
      );

      return res.status(200).json({
        success: true,
        message: "Booking already confirmed.",

        data: {
          bookingId: existingBooking.bookingId,
          ticketToken: existingBooking.ticketToken,
          quantity: existingBooking.quantity,
          selectedSeats: existingBooking.selectedSeats,
          totalPrice: existingBooking.totalPrice,
          status: existingBooking.status,
          paymentStatus: existingBooking.paymentStatus,
          qrCode: existingQrCode,
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

    // 7. Validate ticket price

    const eventPrice = Number(eventData.ticketPrice);

    if (
      eventData.ticketPrice === undefined ||
      eventData.ticketPrice === null ||
      eventData.ticketPrice === "" ||
      !Number.isFinite(eventPrice) ||
      eventPrice <= 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid event ticket price.",
      });
    }

    const normalizedTicketType = "general";

    // 8. Validate payment amount

    const expectedAmount = Math.round(
      eventPrice * quantity * 100
    );

    if (
      !Number.isSafeInteger(expectedAmount) ||
      expectedAmount !== order.amount
    ) {
      return res.status(400).json({
        success: false,
        message:
          "The payment amount does not match the booking price.",
      });
    }

    // 9. Confirm reserved seating

    if (eventData.seatingType === "reserved") {
      if (
        selectedSeats.length !== quantity ||
        new Set(selectedSeats).size !== quantity ||
        selectedSeats.some(
          (seat) =>
            typeof seat !== "string" ||
            !seat.trim()
        )
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid selected seats.",
        });
      }

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
      isReservedSeating = true;
    }

    // 10. Confirm general admission

    else if (eventData.seatingType === "general") {
      if (selectedSeats.length > 0) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid seat details for general admission.",
        });
      }

      const confirmedReservation = await Event.findOneAndUpdate(
        {
          _id: eventId,
          isActive: true,
          seatingType: "general",

          generalReservations: {
            $elemMatch: {
              orderId: razorpay_order_id,
              quantity: quantity,

              reservedUntil: {
                $gt: new Date(),
              },
            },
          },
        },

        {
          $pull: {
            generalReservations: {
              orderId: razorpay_order_id,
            },
          },
        },

        {
          returnDocument: "after",
        }
      );

      if (!confirmedReservation) {
        return res.status(409).json({
          success: false,
          message:
            "Your seat reservation has expired or is no longer available. Your payment needs to be checked by support.",
        });
      }

      reservedEventId = eventId;
      reservedQuantity = quantity;
    }

    else {
      return res.status(400).json({
        success: false,
        message: "Invalid event seating type.",
      });
    }

    // 11. Generate ticket details

    const ticketToken = crypto
      .randomBytes(24)
      .toString("hex");

    const bookingId =
      `BK${Date.now()}${crypto.randomBytes(3).toString("hex")}`;

    const frontendUrl =
      process.env.FRONTEND_URL ||
      "http://localhost:3000";

    const verificationUrl =
      `${frontendUrl}/organizer/verify-ticket?token=${ticketToken}`;

    const qrCode = await QRCode.toDataURL(
      verificationUrl
    );

    // 12. Create booking

    const booking = await Booking.create({
      bookingId,
      ticketToken,
      checkedIn: false,
      user: req.user.user_id,
      event: eventId,
      ticketType: normalizedTicketType,
      quantity,
      selectedSeats,
      totalPrice: expectedAmount / 100,
      status: "confirmed",
      paymentStatus: "paid",
      razorpayOrderId: razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
    });

    bookingCreated = true;

    // 13. Return booking confirmation

    return res.status(201).json({
      success: true,

      message:
        "Payment verified and booking confirmed successfully.",

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

    // 14. Roll back seats if booking creation fails

    if (
      reservedEventId &&
      reservedQuantity > 0 &&
      !bookingCreated
    ) {
      try {
        if (isReservedSeating) {
          await Event.updateOne(
            {
              _id: reservedEventId,
            },

            {
              $set: {
                "seats.$[seat].status": "available",
                "seats.$[seat].reservationOrderId": null,
                "seats.$[seat].reservedUntil": null,
              },

              $inc: {
                availableSeats: reservedQuantity,
              },
            },

            {
              arrayFilters: [
                {
                  "seat.seatNumber": {
                    $in: reservedSeatNumbers,
                  },

                  "seat.status": "booked",
                },
              ],
            }
          );
        } else {
          await Event.updateOne(
            {
              _id: reservedEventId,
            },

            {
              $inc: {
                availableSeats: reservedQuantity,
              },
            }
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

    console.error(
      "Payment verification error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to finish booking verification. Check My Bookings before retrying.",
    });
  }
};


// =====================================================
// RELEASE EXPIRED RESERVATIONS
// =====================================================

const releaseExpiredReservations = async () => {
  const now = new Date();

  let releasedCount = 0;

  // 1. RELEASE EXPIRED RESERVED SEATS

  const reservedEvents = await Event.find({
    seatingType: "reserved",

    seats: {
      $elemMatch: {
        status: "reserved",

        reservedUntil: {
          $lte: now,
        },
      },
    },
  }).select("_id");

  for (const event of reservedEvents) {
    const result = await Event.findOneAndUpdate(
      {
        _id: event._id,

        seats: {
          $elemMatch: {
            status: "reserved",

            reservedUntil: {
              $lte: now,
            },
          },
        },
      },

      [
        {
          $set: {
            availableSeats: {
              $add: [
                "$availableSeats",

                {
                  $size: {
                    $filter: {
                      input: "$seats",
                      as: "seat",

                      cond: {
                        $and: [
                          {
                            $eq: [
                              "$$seat.status",
                              "reserved",
                            ],
                          },

                          {
                            $lte: [
                              "$$seat.reservedUntil",
                              now,
                            ],
                          },
                        ],
                      },
                    },
                  },
                },
              ],
            },

            seats: {
              $map: {
                input: "$seats",
                as: "seat",

                in: {
                  $cond: [
                    {
                      $and: [
                        {
                          $eq: [
                            "$$seat.status",
                            "reserved",
                          ],
                        },

                        {
                          $lte: [
                            "$$seat.reservedUntil",
                            now,
                          ],
                        },
                      ],
                    },

                    {
                      $mergeObjects: [
                        "$$seat",

                        {
                          status: "available",
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

    if (result) {
      releasedCount += 1;
    }
  }

  // 2. RELEASE EXPIRED GENERAL ADMISSION RESERVATIONS

  const generalEvents = await Event.find({
    seatingType: "general",

    generalReservations: {
      $elemMatch: {
        reservedUntil: {
          $lte: now,
        },
      },
    },
  }).select("_id");

  for (const event of generalEvents) {
    const result = await Event.findOneAndUpdate(
      {
        _id: event._id,

        generalReservations: {
          $elemMatch: {
            reservedUntil: {
              $lte: now,
            },
          },
        },
      },

      [
        {
          $set: {
            availableSeats: {
              $add: [
                "$availableSeats",

                {
                  $sum: {
                    $map: {
                      input: {
                        $filter: {
                          input: "$generalReservations",
                          as: "reservation",

                          cond: {
                            $lte: [
                              "$$reservation.reservedUntil",
                              now,
                            ],
                          },
                        },
                      },

                      as: "reservation",

                      in: "$$reservation.quantity",
                    },
                  },
                },
              ],
            },

            generalReservations: {
              $filter: {
                input: "$generalReservations",
                as: "reservation",

                cond: {
                  $gt: [
                    "$$reservation.reservedUntil",
                    now,
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

    if (result) {
      releasedCount += 1;
    }
  }

  if (releasedCount > 0) {
    console.log(
      `${releasedCount} expired reservation records released.`
    );
  }

  return releasedCount;
};


// =====================================================
// EXPORT
// =====================================================

module.exports = {
  createRazorpayOrder,
  verifyRazorpayPayment,
  releaseExpiredReservations,
};