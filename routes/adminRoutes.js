const express = require("express");

const {
    getAllUsers,
    getOneUser,
    deleteUser,
    getAllEvents,
    getEventByid,
    deleteEvent,
    toggleEventStatus,
    updateEvent,
    getDashboardStats,
    getAllBookings,
    cancelBooking
} = require("../controllers/adminController");


const {
  getAdminNotifications,
  approveOrganizer,
  rejectOrganizer,
} = require("../controllers/notificationController");

const {
  getAllReports,
  updateReport,
} = require("../controllers/reportController");

const authMiddleware = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");

const { param, validationResult } = require("express-validator");

const router = express.Router();

// Validation middleware
const validateRequest = (req, res, next) => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        return res.status(400).json({
            status: false,
            message: "Validation failed",
            errors: errors.array()
        });
    }

    next();
};

// Get all users
router.get(
    "/users",
    authMiddleware,
    roleMiddleware(["admin"]),
    getAllUsers
);

// Get one user
router.get(
    "/users/:id",
    authMiddleware,
    roleMiddleware(["admin"]),
    [
        param("id")
            .isMongoId()
            .withMessage("Invalid user ID")
    ],
    validateRequest,
    getOneUser
);

// Delete user
router.delete(
    "/users/:id",
    authMiddleware,
    roleMiddleware(["admin"]),
    [
        param("id")
            .isMongoId()
            .withMessage("Invalid user ID")
    ],
    validateRequest,
    deleteUser
);

// Get all events
router.get(
    "/events",
    authMiddleware,
    roleMiddleware(["admin"]),
    getAllEvents
);

// Get one event
router.get(
    "/events/:id",
    authMiddleware,
    roleMiddleware(["admin"]),
    [
        param("id")
            .isMongoId()
            .withMessage("Invalid event ID")
    ],
    validateRequest,
    getEventByid
);

// Delete event
router.delete(
    "/events/:id",
    authMiddleware,
    roleMiddleware(["admin"]),
    [
        param("id")
            .isMongoId()
            .withMessage("Invalid event ID")
    ],
    validateRequest,
    deleteEvent
);

// Activate or deactivate event
router.patch(
    "/events/:id/toggle-status",
    authMiddleware,
    roleMiddleware(["admin"]),
    [
        param("id")
            .isMongoId()
            .withMessage("Invalid event ID")
    ],
    validateRequest,
    toggleEventStatus
);


// Update event
router.put(
    "/events/:id",
    authMiddleware,
    roleMiddleware(["admin"]),
    [
        param("id")
            .isMongoId()
            .withMessage("Invalid event ID")
    ],
    validateRequest,
    updateEvent
);

// Dashboard statistics
router.get(
    "/dashboard-stats",
    authMiddleware,
    roleMiddleware(["admin"]),
    getDashboardStats
);

// Get all bookings
router.get(
  "/bookings",
  authMiddleware,
  roleMiddleware(["admin"]),
  getAllBookings
);

router.patch(
  "/bookings/:id/cancel",
  authMiddleware,
  roleMiddleware(["admin"]),
  cancelBooking
);

// Get notifications for admin
router.get(
  "/notifications",
  authMiddleware,
  roleMiddleware(["admin"]),
  getAdminNotifications
);

// Approve organizer
router.patch(
  "/organizers/:id/approve",
  authMiddleware,
  roleMiddleware(["admin"]),
  [param("id").isMongoId().withMessage("Invalid organizer ID")],
  validateRequest,
  approveOrganizer
);

// Reject organizer
router.patch(
  "/organizers/:id/reject",
  authMiddleware,
  roleMiddleware(["admin"]),
  [param("id").isMongoId().withMessage("Invalid organizer ID")],
  validateRequest,
  rejectOrganizer
);

// Report management - admin only
router.get(
  "/reports",
  authMiddleware,
  roleMiddleware(["admin"]),
  getAllReports
);

router.patch(
  "/reports/:id",
  authMiddleware,
  roleMiddleware(["admin"]),
  updateReport
);

module.exports = router;