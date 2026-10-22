const express = require("express");
const { createEvent,getAllEvents,getEventById,updateEvent,deleteEvent,getMyEvents } = require("../controllers/eventController");
const authMiddleware = require("../middleware/authMiddleware");
const { check } = require("express-validator");
const roleMiddleware = require("../middleware/roleMiddleware");
const upload = require("../middleware/uploadMiddleware");

const router = express.Router();

router.post(
    "/create",
    authMiddleware,
    roleMiddleware(["organizer"]),
    upload.single("image"),
    createEvent
);

router.get( "/my-events", authMiddleware, roleMiddleware(["organizer"]), getMyEvents );


router.get(
    "/getevent",
    authMiddleware,
    roleMiddleware(["user","organizer"]),
    getAllEvents
);

// Get a single event by ID
 router.get( "/:id", [ check("id") .isMongoId() .withMessage("Invalid event ID"), ], getEventById );


router.put("/:id",authMiddleware,  roleMiddleware(["organizer"]),
[
  check("id")
    .isMongoId()
    .withMessage("Invalid event ID"),

  check("eventName")
    .optional()
    .notEmpty()
    .withMessage("Event name cannot be empty"),

  check("category")
    .optional()
    .notEmpty()
    .withMessage("Category cannot be empty"),

  check("date")
    .optional()
    .notEmpty()
    .withMessage("Date cannot be empty"),

  check("time")
    .optional()
    .notEmpty()
    .withMessage("Time cannot be empty"),

  check("venue")
    .optional()
    .notEmpty()
    .withMessage("Venue cannot be empty"),

  check("location")
    .optional()
    .notEmpty()
    .withMessage("Location cannot be empty"),

  check("description")
    .optional()
    .notEmpty()
    .withMessage("Description cannot be empty"),

  check("ticketPrice")
    .optional()
    .isNumeric()
    .withMessage("Ticket price must be numeric"),

  check("availableSeats")
    .optional()
    .isNumeric()
    .withMessage("Available seats must be numeric"),
], 
    updateEvent)


router.delete("/:id",authMiddleware,  roleMiddleware(["organizer"]),

      [
    check("id")
      .isMongoId()
      .withMessage("Invalid event ID"),
  ],
deleteEvent)


module.exports = router;