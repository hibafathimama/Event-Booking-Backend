const razorpay = require("../config/razorpay");
const crypto = require("crypto");
const Event = require("../models/event");
const Booking = require("../models/booking");
const QRCode = require("qrcode");

const createRazorpayOrder = async (req, res) => {
  try {
    const { eventId, quantity, ticketType } = req.body;

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

    if (
      !Number.isFinite(eventData.ticketPrice) ||
      eventData.ticketPrice <= 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid event price.",
      });
    }

    if (eventData.availableSeats < quantity) {
      return res.status(400).json({
        success: false,
        message: "Not enough seats are available.",
      });
    }

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

    const order = await razorpay.orders.create({
      amount: amountInPaise,
      currency: "INR",
      receipt: `receipt_${Date.now()}`,
      notes: {
        eventId: String(eventData._id),
        quantity: String(quantity),
        ticketType,
        userId: String(req.user.user_id),
      },
    });

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
    console.error("Razorpay order creation failed:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to create payment order.",
    });
  }
};

const verifyRazorpayPayment = async (req, res) => {
  let reservedEventId = null;
  let reservedQuantity = 0;
  let bookingCreated = false;

  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    } = req.body;

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

    // Verify the signature using the secret stored on the backend.
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

    // Fetch the actual order and payment from Razorpay.
    const [order, payment] = await Promise.all([
      razorpay.orders.fetch(razorpay_order_id),
      razorpay.payments.fetch(razorpay_payment_id),
    ]);

    // Make sure the payment belongs to the submitted order.
    if (
      order.id !== razorpay_order_id ||
      payment.order_id !== razorpay_order_id
    ) {
      return res.status(400).json({
        success: false,
        message: "Payment does not match the order.",
      });
    }

    // Do not create a booking for an unpaid or merely authorized payment.
    if (payment.status !== "captured") {
      return res.status(400).json({
        success: false,
        message:
          "Payment is not captured yet. Please check the payment status.",
      });
    }

    // Check the actual order amount and currency against the payment.
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

    // Make sure the order belongs to this logged-in user.
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

    if (
      !eventId ||
      !Number.isInteger(quantity) ||
      quantity <= 0 ||
      !ticketType
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid booking details in the payment order.",
      });
    }

    // Prevent duplicate bookings if the verification request is repeated.
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

    // Atomically reserve seats so concurrent requests cannot oversell.
    const reservedEvent = await Event.findOneAndUpdate(
      {
        _id: eventId,
        isActive: true,
        availableSeats: { $gte: quantity },
      },
      {
        $inc: { availableSeats: -quantity },
      },
      { new: true }
    );

    if (!reservedEvent) {
      return res.status(409).json({
        success: false,
        message:
          "Not enough seats are available. Contact support about your payment.",
      });
    }

    reservedEventId = eventId;
    reservedQuantity = quantity;

    const ticketToken = crypto.randomBytes(24).toString("hex");
    const bookingId = `BK${Date.now()}${crypto
      .randomBytes(3)
      .toString("hex")}`;

    const frontendUrl =
      process.env.FRONTEND_URL || "http://localhost:3000";

    const verificationUrl =
      `${frontendUrl}/organizer/verify-ticket?token=${ticketToken}`;

    const qrCode = await QRCode.toDataURL(verificationUrl);

    const booking = await Booking.create({
      bookingId,
      ticketToken,
      checkedIn: false,
      user: req.user.user_id,
      event: eventId,
      ticketType,
      quantity,
      totalPrice: expectedAmount / 100,
      status: "confirmed",
      paymentStatus: "paid",
      razorpayOrderId: razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
    });

    bookingCreated = true;

    return res.status(201).json({
      success: true,
      message: "Payment verified and booking confirmed successfully.",
      data: {
        bookingId: booking.bookingId,
        ticketToken: booking.ticketToken,
        quantity: booking.quantity,
        totalPrice: booking.totalPrice,
        status: booking.status,
        paymentStatus: booking.paymentStatus,
        qrCode,
      },
    });
  } catch (error) {
    // Restore reserved seats if creating the booking failed.
    if (reservedEventId && reservedQuantity > 0 && !bookingCreated) {
      try {
        await Event.updateOne(
          { _id: reservedEventId },
          { $inc: { availableSeats: reservedQuantity } }
        );
      } catch (rollbackError) {
        console.error(
          "Failed to restore reserved seats:",
          rollbackError.message
        );
      }
    }

    // A duplicate payment ID can occur if two verification requests race.
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message:
          "This payment may already have been processed. Check My Bookings before retrying.",
      });
    }

    console.error("Payment verification error:", error.message);

    return res.status(500).json({
      success: false,
      message:
        "Unable to finish booking verification. Check My Bookings before retrying.",
    });
  }
};

module.exports = {
  createRazorpayOrder,
  verifyRazorpayPayment,
};