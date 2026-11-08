const express = require("express");
const { createEvent,getAllEvents,getEventFilterOptions,getEventById,updateEvent,deleteEvent,getMyEvents } = require("../controllers/eventController");
const authMiddleware = require("../middleware/authMiddleware");
const { check } = require("express-validator");
const roleMiddleware = require("../middleware/roleMiddleware");
const upload = require("../middleware/uploadMiddleware");
const { createReport } = require("../controllers/reportController");
const Report = require("../models/report");


const router = express.Router();

router.post(
  "/create",
  authMiddleware,
  roleMiddleware(["organizer"]),
  upload.single("image"),
  [
    check("ticketPrice")
      .notEmpty()
      .withMessage("Ticket price is required")
      .isFloat({ min: 0 })
      .withMessage("Please enter a valid ticket price"),
  ],
  createEvent
);

// Get all events (public)
router.get("/getevent",authMiddleware,getAllEvents);

router.get("/filter-options", getEventFilterOptions);

// Get events created by the logged-in organizer
router.get(
  "/my-events",
  authMiddleware,
  roleMiddleware(["organizer"]),
  getMyEvents
);

// Get a single event by ID
router.get(
  "/:id",
  [check("id").isMongoId().withMessage("Invalid event ID")],
  getEventById
);

router.put(
  "/:id",
  authMiddleware,
  roleMiddleware(["organizer"]),

  // Multer processes FormData and image upload
  upload.single("image"),

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
  .isFloat({ min: 0 })
  .withMessage("Please enter a valid ticket price"),,

    check("availableSeats")
      .optional()
      .isNumeric()
      .withMessage("Available seats must be numeric"),
  ],

  updateEvent
);


router.delete("/:id",authMiddleware,  roleMiddleware(["organizer"]),

      [
    check("id")
      .isMongoId()
      .withMessage("Invalid event ID"),
  ],
deleteEvent)

//create report for an event
router.post(
"/:id/report",
authMiddleware,
roleMiddleware(["user"]),
async (req, res, next) => {
req.body.event = req.params.id;
next();
},
createReport
);



module.exports = router;