const express = require("express");
const router = express.Router();

const {
sendMessage,
getEventMessages,
getOrganizerConversations,
getUserConversations,
markMessagesAsRead,
} = require("../controllers/messageController");

const authMiddleware = require("../middleware/authMiddleware");

// Send a message
router.post("/send", authMiddleware, sendMessage);

// Get all organizer conversations
router.get(
"/organizer/conversations",
authMiddleware,
getOrganizerConversations
);

// Get messages for one conversation
router.get("/:eventId", authMiddleware, getEventMessages);

router.get("/user/conversations", authMiddleware, getUserConversations);

// Mark received messages as read
router.patch(
"/:eventId/conversation/:userId/read",
authMiddleware,
markMessagesAsRead
);

module.exports = router;
