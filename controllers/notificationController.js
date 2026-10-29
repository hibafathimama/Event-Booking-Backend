const Notification = require("../models/notification");
const User = require("../models/user");

// Get notifications for admin
const getAdminNotifications = async (req, res) => {
  try {
    const notifications = await Notification.find({
      type: "organizer_verification",
    })
      .populate(
        "organizer",
        "firstName lastName email image verificationStatus"
      )
      .sort({ createdAt: -1 });

    return res.status(200).json({
      status: true,
      message: "Admin notifications fetched successfully",
      data: notifications,
    });
  } catch (error) {
    console.error("Get admin notifications error:", error);

    return res.status(500).json({
      status: false,
      message: "Failed to fetch admin notifications",
    });
  }
};



// Mark an organizer verification notification as read
const markOrganizerNotificationAsRead = async (req, res) => {
try {
const notification = await Notification.findOneAndUpdate(
{
_id: req.params.id,
type: "organizer_verification",
},
{ isRead: true },
{ new: true }
);

if (!notification) {
  return res.status(404).json({
    status: false,
    message: "Organizer notification not found",
  });
}

return res.status(200).json({
  status: true,
  message: "Notification marked as read",
  data: notification,
});

} catch (error) {
console.error("MARK ORGANIZER NOTIFICATION AS READ ERROR:", error);

return res.status(500).json({
  status: false,
  message: "Failed to mark notification as read",
});

}
};

// Get the number of unread organizer verification notifications
const getUnreadOrganizerNotificationCount = async (req, res) => {
  try {
    const count = await Notification.countDocuments({
      type: "organizer_verification",
      isRead: false,
    });

    return res.status(200).json({
      status: true,
      count,
    });
  } catch (error) {
    console.error("UNREAD ORGANIZER NOTIFICATION COUNT ERROR:", error);

    return res.status(500).json({
      status: false,
      message: "Failed to fetch unread organizer notification count",
    });
  }
};


// Approve an organizer
const approveOrganizer = async (req, res) => {
  try {
    const User = require("../models/user");

    const organizer = await User.findOne({
      _id: req.params.id,
      role: "organizer",
    });

    if (!organizer) {
      return res.status(404).json({
        status: false,
        message: "Organizer not found",
      });
    }

    organizer.verificationStatus = "approved";
    await organizer.save();

    return res.status(200).json({
      status: true,
      message: "Organizer approved successfully",
      data: {
        id: organizer._id,
        verificationStatus: organizer.verificationStatus,
      },
    });
  } catch (error) {
    console.error("APPROVE ORGANIZER ERROR:", error);

    return res.status(500).json({
      status: false,
      message: "Failed to approve organizer",
    });
  }
};

// Reject an organizer
const rejectOrganizer = async (req, res) => {
  try {
    const User = require("../models/user");

    const organizer = await User.findOne({
      _id: req.params.id,
      role: "organizer",
    });

    if (!organizer) {
      return res.status(404).json({
        status: false,
        message: "Organizer not found",
      });
    }

    organizer.verificationStatus = "rejected";
    await organizer.save();

    return res.status(200).json({
      status: true,
      message: "Organizer rejected successfully",
      data: {
        id: organizer._id,
        verificationStatus: organizer.verificationStatus,
      },
    });
  } catch (error) {
    console.error("REJECT ORGANIZER ERROR:", error);

    return res.status(500).json({
      status: false,
      message: "Failed to reject organizer",
    });
  }
};


// Get notifications for the logged-in user
const getUserNotifications = async (req, res) => {
  try {
    const notifications = await Notification.find({
      user: req.user.user_id,
    }).sort({ createdAt: -1 });

    return res.status(200).json({
      status: true,
      message: "User notifications fetched successfully",
      data: notifications,
    });
  } catch (error) {
    console.error("GET USER NOTIFICATIONS ERROR:", error);

    return res.status(500).json({
      status: false,
      message: "Failed to fetch user notifications",
    });
  }
};

const markNotificationAsRead = async (req, res) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      {
        _id: req.params.id,
        user: req.user.user_id,
      },
      {
        isRead: true,
      },
      {
        new: true,
      }
    );

    if (!notification) {
      return res.status(404).json({
        status: false,
        message: "Notification not found",
      });
    }

    return res.status(200).json({
      status: true,
      message: "Notification marked as read",
      data: notification,
    });
  } catch (error) {
    console.error("MARK NOTIFICATION AS READ ERROR:", error);

    return res.status(500).json({
      status: false,
      message: "Failed to mark notification as read",
    });
  }
};


// Send an important announcement to all users
const sendAnnouncement = async (req, res) => {
  try {
    const { message } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({
        status: false,
        message: "Announcement message is required",
      });
    }

    // Find all users
    const users = await User.find({ role: "user" }).select("_id");

    if (users.length === 0) {
      return res.status(404).json({
        status: false,
        message: "No users found",
      });
    }

    // Create an announcement notification for each user
    const notifications = users.map((user) => ({
      user: user._id,
      type: "announcement",
      message: message.trim(),
    }));

    await Notification.insertMany(notifications);

    return res.status(201).json({
      status: true,
      message: "Announcement sent successfully",
      recipientCount: notifications.length,
    });
  } catch (error) {
    console.error("SEND ANNOUNCEMENT ERROR:", error);

    return res.status(500).json({
      status: false,
      message: "Failed to send announcement",
    });
  }
};

// Get notifications for the logged-in organizer
const getOrganizerNotifications = async (req, res) => {
  try {
    const organizerId = req.user.user_id;

    const notifications = await Notification.find({
      organizer: organizerId,
      type: "event_update",
    }).sort({ createdAt: -1 });

    const unreadCount = notifications.filter(
      (notification) => notification.isRead === false
    ).length;

    return res.status(200).json({
      status: true,
      message: "Organizer notifications fetched successfully",
      data: notifications,
      unreadCount,
    });
  } catch (error) {
    console.error("GET ORGANIZER NOTIFICATIONS ERROR:", error);

    return res.status(500).json({
      status: false,
      message: "Failed to fetch organizer notifications",
    });
  }
};

// Mark an organizer event notification as read
const markOrganizerEventNotificationAsRead = async (req, res) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      {
        _id: req.params.id,
        organizer: req.user.user_id,
        type: "event_update",
      },
      {
        $set: { isRead: true },
      },
      {
        new: true,
      }
    );

    if (!notification) {
      return res.status(404).json({
        status: false,
        message: "Notification not found",
      });
    }

    return res.status(200).json({
      status: true,
      message: "Notification marked as read",
      data: notification,
    });
  } catch (error) {
    console.error(
      "MARK ORGANIZER EVENT NOTIFICATION AS READ ERROR:",
      error
    );

    return res.status(500).json({
      status: false,
      message: "Failed to mark notification as read",
    });
  }
};





module.exports = {
getAdminNotifications,
markOrganizerNotificationAsRead,
getUnreadOrganizerNotificationCount,
approveOrganizer,
rejectOrganizer,
getUserNotifications,
markNotificationAsRead,
sendAnnouncement,
getOrganizerNotifications,
markOrganizerEventNotificationAsRead
};
