const express = require("express");

const { createBooking,getMybookings,getAllbookings,cancelBooking,getOrganizerBookings,getBookingById,getOrganizerBookingById} = require("../controllers/bookingController");

const authMiddleware = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");
const { check } = require("express-validator");

const router = express.Router();

router.post(
  "/create",
  authMiddleware,
  roleMiddleware(["user"]),
  [
    check("event")
      .notEmpty()
      .withMessage("Event is required")
      .isMongoId()
      .withMessage("Invalid event ID"),

    check("ticketType")
      .notEmpty()
      .withMessage("Ticket type is required"),

    check("quantity")
      .notEmpty()
      .withMessage("Quantity is required")
      .isInt({ min: 1 })
      .withMessage("Quantity must be at least 1"),
  ],
  createBooking
);

router.get("/getmybookings",authMiddleware,roleMiddleware(["user"]),getMybookings)
router.get("/getAllbookings", authMiddleware,roleMiddleware(["admin"]),getAllbookings)


router.delete(
  "/cancel/:id",
  authMiddleware,
  roleMiddleware(["user"]),
  [
    check("id")
      .isMongoId()
      .withMessage("Invalid booking ID"),
  ],
  cancelBooking
);

router.get("/getorganizersbooking", authMiddleware, roleMiddleware(["organizer"]),getOrganizerBookings)
router.get(
  "/:id",
  authMiddleware,
  roleMiddleware(["user"]),
  getBookingById
);

router.get(
  "/organizer/:id",
  authMiddleware,
  roleMiddleware(["organizer"]),
  getOrganizerBookingById
);

module.exports = router;