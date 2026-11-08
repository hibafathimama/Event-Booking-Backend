const express = require("express");
const router = express.Router();

const {
  sendMessage,
  getEventMessages,
  getOrganizerConversations,
  getOrganizerUnreadCount,
  getUserConversations,
  markMessagesAsRead,
  getUserUnreadCount,
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

// Get organizer unread message count
router.get(
  "/organizer/unread-count",
  authMiddleware,
  getOrganizerUnreadCount
);

// Get user unread message count
router.get(
  "/user/unread-count",
  authMiddleware,
  getUserUnreadCount
);

// Get all user conversations
router.get(
  "/user/conversations",
  authMiddleware,
  getUserConversations
);

// Mark received messages as read
router.patch(
  "/:eventId/conversation/:userId/read",
  authMiddleware,
  markMessagesAsRead
);

// Get messages for one conversation
router.get("/:eventId", authMiddleware, getEventMessages);

module.exports = router;