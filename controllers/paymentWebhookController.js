
const stripe = require("../config/stripe");
const Booking = require("../models/booking");
const Event = require("../models/event");
const Notification = require("../models/notification");
const crypto = require("crypto");

const handleStripeWebhook = async (req, res) => {
  const signature = req.headers["stripe-signature"];

  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    return res.status(500).send("Stripe webhook secret is not configured");
  }

  let stripeEvent;

  // Verify that the request really came from Stripe.
  try {
    stripeEvent = stripe.webhooks.constructEvent(
      req.body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (error) {
    console.error("Stripe signature verification failed:", error.message);
    return res.status(400).send("Invalid webhook signature");
  }

  try {
    // 1. Handle successful Checkout sessions.
    if (stripeEvent.type === "checkout.session.completed") {
      const session = stripeEvent.data.object;

      // Do not confirm a booking until Stripe reports payment as paid.
      if (session.payment_status !== "paid") {
        return res.status(200).json({
          received: true,
          message: "Payment is not completed yet",
        });
      }

      const bookingId = session.metadata?.bookingId;

      if (!bookingId) {
        console.error("Missing booking ID in Stripe session metadata");
        return res.status(400).json({
          message: "Booking ID missing",
        });
      }

      const booking = await Booking.findById(bookingId);

      if (!booking) {
        console.error("Booking not found:", bookingId);
        return res.status(404).json({
          message: "Booking not found",
        });
      }

      // Verify that this Checkout session belongs to this booking.
      if (
        booking.stripeSessionId !== session.id ||
        session.metadata?.userId !== booking.user.toString() ||
        session.metadata?.eventId !== booking.event.toString()
      ) {
        return res.status(400).json({
          message: "Payment session does not match booking",
        });
      }

      // Verify the amount and currency.
      const expectedAmount = Math.round(booking.totalPrice * 100);

      if (
        session.amount_total !== expectedAmount ||
        session.currency?.toLowerCase() !== "inr"
      ) {
        console.error("Stripe amount or currency mismatch:", session.id);
        return res.status(400).json({
          message: "Payment amount mismatch",
        });
      }

      // Avoid issuing another ticket for an already-paid booking.
      if (booking.paymentStatus === "paid") {
        return res.status(200).json({ received: true });
      }

      // Only pending bookings can be confirmed.
      if (
        booking.status !== "pending" ||
        booking.paymentStatus !== "pending"
      ) {
        console.error("Booking is not pending:", booking.bookingId);
        return res.status(409).json({
          message: "Booking is no longer pending",
        });
      }

      const eventData = await Event.findById(booking.event);

      if (!eventData) {
        return res.status(404).json({
          message: "Event not found",
        });
      }

      // Generate a secure ticket token after payment verification.
      const ticketToken = crypto.randomBytes(32).toString("hex");

      // Atomically claim the pending booking to reduce duplicate processing.
      const confirmedBooking = await Booking.findOneAndUpdate(
        {
          _id: booking._id,
          stripeSessionId: session.id,
          status: "pending",
          paymentStatus: "pending",
        },
        {
          $set: {
            ticketToken,
            status: "confirmed",
            paymentStatus: "paid",
          },
        },
        { new: true }
      );

      if (!confirmedBooking) {
        const latestBooking = await Booking.findById(booking._id);

        if (latestBooking?.paymentStatus === "paid") {
          return res.status(200).json({ received: true });
        }

        return res.status(409).json({
          message: "Booking could not be confirmed",
        });
      }

      try {
        await Notification.create({
          user: confirmedBooking.user,
          type: "booking_confirmation",
          message: `Your booking for ${eventData.eventName} has been confirmed. Booking ID: ${confirmedBooking.bookingId}`,
        });
      } catch (notificationError) {
        console.error(
          "BOOKING NOTIFICATION ERROR:",
          notificationError
        );
      }

      console.log(
        "Booking confirmed after payment:",
        confirmedBooking.bookingId
      );
    }

    // 2. Handle expired Checkout sessions.
    else if (stripeEvent.type === "checkout.session.expired") {
      const session = stripeEvent.data.object;
      const bookingId = session.metadata?.bookingId;

      if (!bookingId) {
        return res.status(200).json({ received: true });
      }

      // Only one webhook retry can change this pending booking.
      const expiredBooking = await Booking.findOneAndUpdate(
        {
          _id: bookingId,
          stripeSessionId: session.id,
          status: "pending",
          paymentStatus: "pending",
        },
        {
          $set: {
            status: "cancelled",
            paymentStatus: "expired",
          },
        },
        { new: true }
      );

      if (expiredBooking) {
        await Event.findByIdAndUpdate(expiredBooking.event, {
          $inc: { availableSeats: expiredBooking.quantity },
        });

        console.log(
          "Expired booking released:",
          expiredBooking.bookingId
        );
      }
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    console.error("STRIPE WEBHOOK PROCESSING ERROR:", error);

    return res.status(500).json({
      message: "Webhook processing failed",
    });
  }
};

module.exports = { handleStripeWebhook };
