const express = require("express");

const {
    getAllUsers,
    getOneUser,
    deleteUser,
    getAllEvents,
    getEventByid,
    deleteEvent,
    getDashboardStats
} = require("../controllers/adminController");

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

// Dashboard statistics
router.get(
    "/dashboard-stats",
    authMiddleware,
    roleMiddleware(["admin"]),
    getDashboardStats
);

module.exports = router;