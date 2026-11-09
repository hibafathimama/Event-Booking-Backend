const crypto = require("crypto");
const Booking = require("../models/booking");

const handleRazorpayWebhook = async (req, res) => {
  try {
    // Get Razorpay webhook signature
    const signature = req.headers["x-razorpay-signature"];

    if (!signature) {
      return res.status(400).json({
        status: false,
        message: "Missing Razorpay webhook signature",
      });
    }

    // Get webhook secret from environment variables
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

    if (!webhookSecret) {
      console.error("Razorpay webhook secret is missing");

      return res.status(500).json({
        status: false,
        message: "Webhook configuration error",
      });
    }

    // Verify webhook signature using the original raw request body
    const expectedSignature = crypto
      .createHmac("sha256", webhookSecret)
      .update(req.body)
      .digest("hex");

    const receivedBuffer = Buffer.from(signature, "hex");
    const expectedBuffer = Buffer.from(expectedSignature, "hex");

    if (
      receivedBuffer.length !== expectedBuffer.length ||
      !crypto.timingSafeEqual(receivedBuffer, expectedBuffer)
    ) {
      return res.status(400).json({
        status: false,
        message: "Invalid Razorpay webhook signature",
      });
    }

    // Parse webhook data
    const webhookData = JSON.parse(req.body.toString());

    const event = webhookData.event;

    console.log("Razorpay webhook received:", event);

    // Handle only refund events
    if (!["refund.processed", "refund.failed"].includes(event)) {
      return res.status(200).json({
        status: true,
        message: "Webhook event ignored",
      });
    }

    const refund = webhookData.payload?.refund?.entity;

    if (!refund || !refund.id || !refund.payment_id) {
      return res.status(400).json({
        status: false,
        message: "Invalid refund information",
      });
    }

    // Find the booking associated with this refund
    const booking = await Booking.findOne({
      razorpayPaymentId: refund.payment_id,
      razorpayRefundId: refund.id,
    });

    if (!booking) {
      console.error("Booking not found for refund:", refund.id);

      return res.status(200).json({
        status: true,
        message: "Booking not found for this refund",
      });
    }

    // Verify the refund amount
    const expectedAmount = Math.round(booking.refundAmount * 100);

    if (refund.amount !== expectedAmount) {
      console.error("Refund amount mismatch:", refund.id);

      return res.status(400).json({
        status: false,
        message: "Refund amount mismatch",
      });
    }

    // Update booking based on refund event
    if (event === "refund.processed") {
      booking.refundStatus = "processed";
      booking.paymentStatus = "refunded";
    }

    if (event === "refund.failed") {
      booking.refundStatus = "failed";
      booking.paymentStatus = "paid";
    }

    await booking.save();

    console.log("Booking refund status updated:", {
      bookingId: booking.bookingId,
      refundStatus: booking.refundStatus,
      paymentStatus: booking.paymentStatus,
    });

    return res.status(200).json({
      status: true,
      message: "Refund status updated successfully",
    });
  } catch (error) {
    console.error("RAZORPAY WEBHOOK ERROR:", error);

    return res.status(500).json({
      status: false,
      message: "Failed to process Razorpay webhook",
    });
  }
};

module.exports = {
  handleRazorpayWebhook,
};