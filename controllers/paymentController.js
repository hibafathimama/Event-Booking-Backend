const stripe = require("../config/stripe");
const Booking = require("../models/booking");
const Event = require("../models/event");

const createCheckoutSession = async (req, res) => {
  let booking = null;
  let seatsReserved = false;
  let eventId = null;
  let ticketQuantity = 0;

  try {
    const { event, ticketType, quantity } = req.body;

    if (!event || !ticketType || quantity === undefined) {
      return res.status(400).json({
        status: false,
        message: "Event, ticket type and quantity are required",
      });
    }

    ticketQuantity = Number(quantity);

    if (!Number.isInteger(ticketQuantity) || ticketQuantity <= 0) {
      return res.status(400).json({
        status: false,
        message: "Quantity must be a positive integer",
      });
    }

    if (!process.env.STRIPE_SECRET_KEY) {
      return res.status(503).json({
        status: false,
        message: "Stripe test credentials are not configured",
      });
    }

    if (!process.env.FRONTEND_URL) {
      return res.status(500).json({
        status: false,
        message: "FRONTEND_URL is not configured",
      });
    }

    const eventData = await Event.findOne({
      _id: event,
      isActive: true,
    });

    if (!eventData) {
      return res.status(404).json({
        status: false,
        message: "Event not found or unavailable",
      });
    }

    eventId = eventData._id;

    const eventDateTime = new Date(
      `${new Date(eventData.date).toISOString().split("T")[0]}T${eventData.time}`
    );

    if (
      Number.isNaN(eventDateTime.getTime()) ||
      eventDateTime < new Date()
    ) {
      return res.status(400).json({
        status: false,
        message: "The event date or time is invalid, or the event has passed",
      });
    }

    const ticketPrice = Number(eventData.ticketPrice);
    const totalPrice = ticketPrice * ticketQuantity;

    if (
      !Number.isFinite(ticketPrice) ||
      ticketPrice <= 0 ||
      !Number.isFinite(totalPrice)
    ) {
      return res.status(400).json({
        status: false,
        message: "The event ticket price is invalid",
      });
    }

    // Reserve seats atomically so users cannot reserve more seats
    // than are available.
    const updatedEvent = await Event.findOneAndUpdate(
      {
        _id: eventId,
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
        message: "Not enough seats are available",
      });
    }

    seatsReserved = true;

    // Create a pending booking. The ticket is not issued yet.
    booking = await Booking.create({
      bookingId: `BK${Date.now()}${Math.floor(Math.random() * 1000)}`,
      user: req.user.user_id,
      event: eventId,
      ticketType,
      quantity: ticketQuantity,
      totalPrice,
      status: "pending",
      paymentStatus: "pending",
    });

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "inr",
            product_data: {
              name: eventData.eventName,
              description: `${ticketType} ticket`,
            },
            unit_amount: Math.round(ticketPrice * 100),
          },
          quantity: ticketQuantity,
        },
      ],
      success_url: `${process.env.FRONTEND_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/payment/cancel`,
      metadata: {
        bookingId: booking._id.toString(),
        userId: req.user.user_id.toString(),
        eventId: eventId.toString(),
      },
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
    });

    booking.stripeSessionId = session.id;
    await booking.save();

    return res.status(201).json({
      status: true,
      message: "Checkout session created",
      data: {
        bookingId: booking.bookingId,
        checkoutUrl: session.url,
      },
    });
  } catch (error) {
    console.error("CREATE CHECKOUT SESSION ERROR:", error);

    // Restore reserved seats and remove the pending booking
    // if Checkout setup fails.
    try {
      if (booking) {
        await Booking.deleteOne({ _id: booking._id });
      }

      if (seatsReserved && eventId) {
        await Event.findByIdAndUpdate(eventId, {
          $inc: { availableSeats: ticketQuantity },
        });
      }
    } catch (cleanupError) {
      console.error("CHECKOUT CLEANUP ERROR:", cleanupError);
    }

    return res.status(500).json({
      status: false,
      message: "Unable to create payment session",
    });
  }
};

module.exports = {
  createCheckoutSession,
};