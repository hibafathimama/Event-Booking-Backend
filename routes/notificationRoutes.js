
const express = require("express");


const {
  getAdminNotifications,
  getUnreadOrganizerNotificationCount,
  markOrganizerNotificationAsRead,
  approveOrganizer,
  rejectOrganizer,
  getUserNotifications,
  markNotificationAsRead,
  sendAnnouncement,
  getOrganizerNotifications,
  markOrganizerEventNotificationAsRead
} = require("../controllers/notificationController");


const authMiddleware = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");

const router = express.Router();

// Get notifications for the logged-in user
router.get(
  "/",
  authMiddleware,
  roleMiddleware(["user"]),
  getUserNotifications
);

// Mark an organizer notification as read (admin only)
router.patch(
  "/admin/:id/read",
  authMiddleware,
  roleMiddleware(["admin"]),
  markOrganizerNotificationAsRead
);

// Get unread organizer notification count for admin
router.get(
  "/admin/unread-count",
  authMiddleware,
  roleMiddleware(["admin"]),
  getUnreadOrganizerNotificationCount
);

// Mark a notification as read
router.patch(
  "/:id/read",
  authMiddleware,
  roleMiddleware(["user"]),
  markNotificationAsRead
);

// Admin sends announcements to users
router.post(
  "/announcement",
  authMiddleware,
  roleMiddleware(["admin"]),
  sendAnnouncement
);

// Get organizer verification notifications for admin
router.get(
  "/admin",
  authMiddleware,
  roleMiddleware(["admin"]),
  getAdminNotifications
);

// Approve an organizer
router.patch(
  "/admin/organizers/:id/approve",
  authMiddleware,
  roleMiddleware(["admin"]),
  approveOrganizer
);

// Reject an organizer
router.patch(
  "/admin/organizers/:id/reject",
  authMiddleware,
  roleMiddleware(["admin"]),
  rejectOrganizer
);

// Get notifications for the logged-in organizer
router.get(
  "/organizer",
  authMiddleware,
  roleMiddleware(["organizer"]),
  getOrganizerNotifications
);

// Mark an organizer's notification as read
router.patch(
  "/organizer/:id/read",
  authMiddleware,
  roleMiddleware(["organizer"]),
  markOrganizerEventNotificationAsRead
);


module.exports = router;
