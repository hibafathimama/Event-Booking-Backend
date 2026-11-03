const express = require("express");
const router = express.Router();

const {
  addReview,
  getEventReviews,
  updateReview,
  deleteReview,
  getEventRating,
  getOrganizerEventReviews
} = require("../controllers/reviewController");

const authMiddleware = require("../middleware/authMiddleware");

// Add a review (logged-in user)
router.post("/", authMiddleware, addReview);

// Get all reviews for an event (public)
router.get("/event/:eventId", getEventReviews);

// Get average rating and total reviews (public)
router.get("/event/:eventId/rating", getEventRating);

// Update your own review
router.put("/:reviewId", authMiddleware, updateReview);

// Delete your own review
router.delete("/:reviewId", authMiddleware, deleteReview);

// Organizer: Get reviews for their own event
router.get(
  "/organizer/event/:eventId",
  authMiddleware,
  getOrganizerEventReviews
);

module.exports = router;
