const express = require("express");
const router = express.Router();

const {
sendMessage,
getEventMessages,
} = require("../controllers/messageController");

const authMiddleware = require("../middleware/authMiddleware");

// Send a message to an event organizer
router.post("/send", authMiddleware, sendMessage);

// Get messages related to an event
router.get("/:eventId", authMiddleware, getEventMessages);

module.exports = router;
