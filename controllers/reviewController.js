const Review = require("../models/review");
const Booking = require("../models/booking");
const Event = require("../models/event");
const mongoose = require("mongoose");

// Add a review
const addReview = async (req, res) => {
  try {
    const { eventId, rating, comment } = req.body;
    const userId = req.user.user_id;

    if (req.user.role !== "user") {
      return res.status(403).json({
        success: false,
        message: "Only users can submit reviews.",
      });
    }

    if (!eventId || !mongoose.isValidObjectId(eventId)) {
      return res.status(400).json({
        success: false,
        message: "Valid event ID is required.",
      });
    }

    const numericRating = Number(rating);

    if (
      !Number.isInteger(numericRating) ||
      numericRating < 1 ||
      numericRating > 5
    ) {
      return res.status(400).json({
        success: false,
        message: "Rating must be between 1 and 5.",
      });
    }

    if (
      typeof comment !== "string" ||
      !comment.trim() ||
      comment.trim().length > 1000
    ) {
      return res.status(400).json({
        success: false,
        message: "Review must contain 1 to 1000 characters.",
      });
    }

    const event = await Event.findById(eventId);

    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Event not found.",
      });
    }

    // Check whether the event has already taken place.
    const eventDate = new Date(event.date);

    if (Number.isNaN(eventDate.getTime()) || eventDate >= new Date()) {
      return res.status(400).json({
        success: false,
        message: "You can review this event only after it has taken place.",
      });
    }

    // Check whether the user has a confirmed and paid booking.
    const booking = await Booking.findOne({
      user: userId,
      event: eventId,
      status: "confirmed",
      paymentStatus: "paid",
    });

    if (!booking) {
      return res.status(403).json({
        success: false,
        message: "You must have a confirmed and paid booking to review this event.",
      });
    }

    // Prevent duplicate reviews.
    const existingReview = await Review.findOne({
      user: userId,
      event: eventId,
    });

    if (existingReview) {
      return res.status(409).json({
        success: false,
        message: "You have already reviewed this event.",
      });
    }

    const review = await Review.create({
      user: userId,
      event: eventId,
      rating: numericRating,
      comment: comment.trim(),
    });

    const populatedReview = await Review.findById(review._id)
      .populate("user", "firstName lastName")
      .populate("event", "eventName");

    return res.status(201).json({
      success: true,
      message: "Review submitted successfully.",
      data: populatedReview,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "You have already reviewed this event.",
      });
    }

    console.error("Add review error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to submit review.",
    });
  }
};

// Get all reviews for an event
const getEventReviews = async (req, res) => {
  try {
    const { eventId } = req.params;

    if (!mongoose.isValidObjectId(eventId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid event ID.",
      });
    }

    const event = await Event.findById(eventId);

    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Event not found.",
      });
    }

    const reviews = await Review.find({ event: eventId })
      .populate("user", "firstName lastName")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      message: "Reviews fetched successfully.",
      data: reviews,
    });
  } catch (error) {
    console.error("Get event reviews error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch reviews.",
    });
  }
};

// Update your own review
const updateReview = async (req, res) => {
  try {
    const { reviewId } = req.params;
    const { rating, comment } = req.body;
    const userId = req.user.user_id;

    if (req.user.role !== "user") {
      return res.status(403).json({
        success: false,
        message: "Only users can update reviews.",
      });
    }

    if (!mongoose.isValidObjectId(reviewId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid review ID.",
      });
    }

    const numericRating = Number(rating);

    if (
      !Number.isInteger(numericRating) ||
      numericRating < 1 ||
      numericRating > 5
    ) {
      return res.status(400).json({
        success: false,
        message: "Rating must be between 1 and 5.",
      });
    }

    if (
      typeof comment !== "string" ||
      !comment.trim() ||
      comment.trim().length > 1000
    ) {
      return res.status(400).json({
        success: false,
        message: "Review must contain 1 to 1000 characters.",
      });
    }

    const review = await Review.findOneAndUpdate(
      {
        _id: reviewId,
        user: userId,
      },
      {
        $set: {
          rating: numericRating,
          comment: comment.trim(),
        },
      },
      {
        new: true,
        runValidators: true,
      }
    )
      .populate("user", "firstName lastName")
      .populate("event", "eventName");

    if (!review) {
      return res.status(404).json({
        success: false,
        message: "Review not found or you are not authorized to update it.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Review updated successfully.",
      data: review,
    });
  } catch (error) {
    console.error("Update review error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update review.",
    });
  }
};

// Delete your own review
const deleteReview = async (req, res) => {
  try {
    const { reviewId } = req.params;
    const userId = req.user.user_id;

    if (req.user.role !== "user") {
      return res.status(403).json({
        success: false,
        message: "Only users can delete reviews.",
      });
    }

    if (!mongoose.isValidObjectId(reviewId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid review ID.",
      });
    }

    const review = await Review.findOneAndDelete({
      _id: reviewId,
      user: userId,
    });

    if (!review) {
      return res.status(404).json({
        success: false,
        message: "Review not found or you are not authorized to delete it.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Review deleted successfully.",
    });
  } catch (error) {
    console.error("Delete review error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to delete review.",
    });
  }
};

// Get average rating and total reviews for an event
const getEventRating = async (req, res) => {
  try {
    const { eventId } = req.params;

    if (!mongoose.isValidObjectId(eventId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid event ID.",
      });
    }

    const result = await Review.aggregate([
      {
        $match: {
          event: new mongoose.Types.ObjectId(eventId),
        },
      },
      {
        $group: {
          _id: "$event",
          averageRating: { $avg: "$rating" },
          totalReviews: { $sum: 1 },
        },
      },
    ]);

    return res.status(200).json({
      success: true,
      message: "Event rating fetched successfully.",
      data: {
        averageRating: result.length
          ? Number(result[0].averageRating.toFixed(1))
          : 0,
        totalReviews: result.length ? result[0].totalReviews : 0,
      },
    });
  } catch (error) {
    console.error("Get event rating error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch event rating.",
    });
  }
};

// Get reviews for an event owned by the logged-in organizer
const getOrganizerEventReviews = async (req, res) => {
  try {
    const { eventId } = req.params;
    const organizerId = req.user.user_id;

    // Only organizers can access this endpoint.
    if (req.user.role !== "organizer") {
      return res.status(403).json({
        success: false,
        message: "Only organizers can view these reviews.",
      });
    }

    if (!mongoose.isValidObjectId(eventId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid event ID.",
      });
    }

    // Check whether this event belongs to the logged-in organizer.
    const event = await Event.findOne({
      _id: eventId,
      organizer: organizerId,
    });

    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Event not found or you are not authorized to view its reviews.",
      });
    }

    // Fetch reviews for this organizer's event.
    const reviews = await Review.find({ event: eventId })
      .populate("user", "firstName lastName")
      .sort({ createdAt: -1 });

    // Calculate average rating.
    const ratingResult = await Review.aggregate([
      {
        $match: {
          event: new mongoose.Types.ObjectId(eventId),
        },
      },
      {
        $group: {
          _id: "$event",
          averageRating: { $avg: "$rating" },
          totalReviews: { $sum: 1 },
        },
      },
    ]);

    const rating = {
      averageRating: ratingResult.length
        ? Number(ratingResult[0].averageRating.toFixed(1))
        : 0,
      totalReviews: ratingResult.length
        ? ratingResult[0].totalReviews
        : 0,
    };

    return res.status(200).json({
      success: true,
      message: "Organizer reviews fetched successfully.",
      data: {
        eventName: event.eventName,
        rating,
        reviews,
      },
    });
  } catch (error) {
    console.error("Get organizer event reviews error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch organizer reviews.",
    });
  }
};



module.exports = {
  addReview,
  getEventReviews,
  updateReview,
  deleteReview,
  getEventRating,
  getOrganizerEventReviews
};
