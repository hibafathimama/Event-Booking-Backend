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

  // Admin ↔ Organizer
  sendAdminOrganizerMessage,
  getAdminConversations,
  getOrganizerAdminConversations,
  getAdminOrganizerMessages,
  markAdminMessagesAsRead,
  getAdminUnreadCount,
  getOrganizerAdminUnreadCount,
  getAllOrganizers,
} = require("../controllers/messageController");

const authMiddleware = require("../middleware/authMiddleware");

// ==========================================
// EXISTING USER ↔ ORGANIZER MESSAGING
// ==========================================

router.post("/send", authMiddleware, sendMessage);

router.get(
  "/organizer/conversations",
  authMiddleware,
  getOrganizerConversations
);

router.get(
  "/organizer/unread-count",
  authMiddleware,
  getOrganizerUnreadCount
);

router.get(
  "/user/unread-count",
  authMiddleware,
  getUserUnreadCount
);

router.get(
  "/user/conversations",
  authMiddleware,
  getUserConversations
);

router.patch(
  "/:eventId/conversation/:userId/read",
  authMiddleware,
  markMessagesAsRead
);

// ==========================================
// ADMIN ↔ ORGANIZER MESSAGING
// ==========================================

// Send direct message
router.post(
  "/admin-organizer/send",
  authMiddleware,
  sendAdminOrganizerMessage
);

// Get all registered organizers (Admin)
router.get(
  "/admin-organizer/organizers",
  authMiddleware,
  getAllOrganizers
);

// Get all organizer conversations (Admin)
router.get(
  "/admin-organizer/admin/conversations",
  authMiddleware,
  getAdminConversations
);

// Get all admin conversations (Organizer)
// Keep this route BEFORE /admin-organizer/:userId
router.get(
  "/admin-organizer/conversations",
  authMiddleware,
  getOrganizerAdminConversations
);

// Admin unread count
router.get(
  "/admin-organizer/admin/unread-count",
  authMiddleware,
  getAdminUnreadCount
);

// Organizer unread count
router.get(
  "/admin-organizer/organizer/unread-count",
  authMiddleware,
  getOrganizerAdminUnreadCount
);

// Mark messages as read
router.patch(
  "/admin-organizer/:userId/read",
  authMiddleware,
  markAdminMessagesAsRead
);

// Get individual conversation
router.get(
  "/admin-organizer/:userId",
  authMiddleware,
  getAdminOrganizerMessages
);

// ==========================================
// EXISTING EVENT MESSAGE ROUTE
// Keep last
// ==========================================

router.get("/:eventId", authMiddleware, getEventMessages);

module.exports = router;