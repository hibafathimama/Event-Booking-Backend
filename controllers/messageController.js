const Message = require("../models/message");
const Event = require("../models/event");
const User = require("../models/user");
const mongoose = require("mongoose");

// Send a message to an event organizer
const sendMessage = async (req, res) => {
try {
const { eventId, message } = req.body;
const senderId = req.user.user_id;
const role = req.user.role;

if (!eventId || !message || !message.trim()) {
  return res.status(400).json({
    success: false,
    message: "Event ID and message are required.",
  });
}

if (message.trim().length > 2000) {
  return res.status(400).json({
    success: false,
    message: "Message cannot exceed 2000 characters.",
  });
}

if (!["user", "organizer"].includes(role)) {
  return res.status(403).json({
    success: false,
    message: "Only users and organizers can send messages.",
  });
}

const event = await Event.findById(eventId);

if (!event) {
  return res.status(404).json({
    success: false,
    message: "Event not found.",
  });
}

if (!event.isActive) {
  return res.status(400).json({
    success: false,
    message: "This event is not currently active.",
  });
}

const organizerId = event.organizer;

// Only users should be prevented from messaging themselves.
if (
  role === "user" &&
  String(senderId) === String(organizerId)
) {
  return res.status(400).json({
    success: false,
    message: "You cannot message yourself.",
  });
}

// Only the owner of the event can reply as its organizer.
if (
  role === "organizer" &&
  String(senderId) !== String(organizerId)
) {
  return res.status(403).json({
    success: false,
    message: "You are not authorized to reply to this event.",
  });
}

// Users can message the organizer.
// Organizers can reply only to an existing conversation.
let receiverId;

if (role === "user") {
  receiverId = organizerId;
} else {
  const { receiverId: userId } = req.body;

  if (!userId) {
    return res.status(400).json({
      success: false,
      message: "Receiver ID is required for organizer replies.",
    });
  }

  const conversationExists = await Message.exists({
    event: event._id,
    sender: userId,
    receiver: organizerId,
  });

  if (!conversationExists) {
    return res.status(403).json({
      success: false,
      message: "Conversation not found or not authorized.",
    });
  }

  receiverId = userId;
}

const newMessage = await Message.create({
  sender: senderId,
  receiver: receiverId,
  event: event._id,
  message: message.trim(),
});

return res.status(201).json({
  success: true,
  message: "Message sent successfully.",
  data: newMessage,
});

} catch (error) {
console.error("Send message error:", error);

return res.status(500).json({
  success: false,
  message: "Failed to send message.",
});

}
};

// Get messages for a particular conversation
const getEventMessages = async (req, res) => {
try {
const { eventId } = req.params;
const currentUserId = req.user.user_id;
const role = req.user.role;

const event = await Event.findById(eventId);

if (!event) {
  return res.status(404).json({
    success: false,
    message: "Event not found.",
  });
}

const organizerId = String(event.organizer);
const currentId = String(currentUserId);

let filter;

if (role === "user") {
  // A user can view only their own conversation.
  filter = {
    event: event._id,
    $or: [
      { sender: currentUserId, receiver: event.organizer },
      { sender: event.organizer, receiver: currentUserId },
    ],
  };
} else if (role === "organizer") {
  // An organizer can view conversations only for their own events.
  if (currentId !== organizerId) {
    return res.status(403).json({
      success: false,
      message: "You are not authorized to view this event's messages.",
    });
  }

  const { userId } = req.query;

  if (!userId) {
    return res.status(400).json({
      success: false,
      message: "User ID is required to view a conversation.",
    });
  }

  filter = {
    event: event._id,
    $or: [
      { sender: userId, receiver: event.organizer },
      { sender: event.organizer, receiver: userId },
    ],
  };
} else {
  return res.status(403).json({
    success: false,
    message: "You are not authorized to view messages.",
  });
}

const messages = await Message.find(filter)
  .populate("sender", "firstName lastName email role")
  .populate("receiver", "firstName lastName email role")
  .sort({ createdAt: 1 });

return res.status(200).json({
  success: true,
  message: "Messages fetched successfully.",
  data: messages,
});

} catch (error) {
console.error("Get messages error:", error);

return res.status(500).json({
  success: false,
  message: "Failed to fetch messages.",
});

}
};


// Get all conversations belonging to the logged-in organizer
const getOrganizerConversations = async (req, res) => {
try {
const organizerId = req.user.user_id;

if (req.user.role !== "organizer") {
  return res.status(403).json({
    success: false,
    message: "Only organizers can access this page.",
  });
}

// Find events created by this organizer
const events = await Event.find({
  organizer: organizerId,
}).select("_id eventName");

const eventIds = events.map((event) => event._id);

if (eventIds.length === 0) {
  return res.status(200).json({
    success: true,
    data: [],
    message: "No conversations found.",
  });
}

// Find all messages related to the organizer's events
const messages = await Message.find({
  event: { $in: eventIds },
})
  .populate("sender", "firstName lastName email role")
  .populate("receiver", "firstName lastName email role")
  .populate("event", "eventName")
  .sort({ createdAt: -1 });

// Group messages by event and user
const conversations = new Map();

messages.forEach((item) => {
  const senderId = String(item.sender._id);
  const receiverId = String(item.receiver._id);
  const organizerIdString = String(organizerId);

  const user =
    senderId === organizerIdString
      ? item.receiver
      : item.sender;

  const key = `${String(item.event._id)}_${String(user._id)}`;

  if (!conversations.has(key)) {
    conversations.set(key, {
      event: item.event,
      user,
      lastMessage: item,
      unreadCount: 0,
    });
  }

  // Count unread messages received by the organizer
  if (
    String(item.receiver._id) === organizerIdString &&
    !item.isRead
  ) {
    conversations.get(key).unreadCount += 1;
  }
});

return res.status(200).json({
  success: true,
  message: "Organizer conversations fetched successfully.",
  data: Array.from(conversations.values()),
});

} catch (error) {
console.error("Organizer conversations error:", error);

return res.status(500).json({
  success: false,
  message: "Failed to fetch organizer conversations.",
});

}
};

// Get all conversations belonging to the logged-in user
const getUserConversations = async (req, res) => {
try {
const userId = req.user.user_id;

if (req.user.role !== "user") {
  return res.status(403).json({
    success: false,
    message: "Only users can access this page.",
  });
}

// Find all messages where the logged-in user is sender or receiver.
const messages = await Message.find({
  $or: [
    { sender: userId },
    { receiver: userId },
  ],
})
  .populate("sender", "firstName lastName email role")
  .populate("receiver", "firstName lastName email role")
  .populate("event", "eventName")
  .sort({ createdAt: -1 });

// Group messages by event and organizer.
const conversations = new Map();

messages.forEach((item) => {
  if (!item.event || !item.sender || !item.receiver) return;

  // Identify the organizer in this conversation.
  const organizer =
    String(item.sender._id) === String(userId)
      ? item.receiver
      : item.sender;

  // Only include conversations with organizers.
  if (organizer.role !== "organizer") return;

  const key = `${String(item.event._id)}_${String(organizer._id)}`;

  if (!conversations.has(key)) {
    conversations.set(key, {
      event: item.event,
      organizer,
      lastMessage: item.message,
      updatedAt: item.createdAt,
      unreadCount: 0,
    });
  }

  // Count unread messages received by the user.
  if (
    String(item.receiver._id) === String(userId) &&
    !item.isRead
  ) {
    conversations.get(key).unreadCount += 1;
  }
});

return res.status(200).json({
  success: true,
  message: "User conversations fetched successfully.",
  data: Array.from(conversations.values()),
});

} catch (error) {
console.error("User conversations error:", error);

return res.status(500).json({
  success: false,
  message: "Failed to fetch user conversations.",
});

}
};

// Mark received messages as read
const markMessagesAsRead = async (req, res) => {
try {
const { eventId, userId } = req.params;
const currentUserId = req.user.user_id;
const role = req.user.role;

if (!mongoose.isValidObjectId(eventId) ||
    !mongoose.isValidObjectId(userId)) {
  return res.status(400).json({
    success: false,
    message: "Invalid event ID or user ID.",
  });
}

const event = await Event.findById(eventId);

if (!event) {
  return res.status(404).json({
    success: false,
    message: "Event not found.",
  });
}

const organizerId = String(event.organizer);
const currentId = String(currentUserId);

// Check whether the logged-in person belongs to this conversation
if (
  role === "organizer" &&
  currentId !== organizerId
) {
  return res.status(403).json({
    success: false,
    message: "You are not authorized to access this conversation.",
  });
}

if (
  role === "user" &&
  currentId !== String(userId)
) {
  return res.status(403).json({
    success: false,
    message: "You can only access your own conversation.",
  });
}

if (!["user", "organizer"].includes(role)) {
  return res.status(403).json({
    success: false,
    message: "You are not authorized.",
  });
}

const result = await Message.updateMany(
  {
    event: eventId,
    sender: role === "organizer" ? userId : event.organizer,
    receiver: currentUserId,
    isRead: false,
  },
  {
    $set: { isRead: true },
  }
);

return res.status(200).json({
  success: true,
  message: "Messages marked as read.",
  modifiedCount: result.modifiedCount,
});

} catch (error) {
console.error("Mark messages read error:", error);

return res.status(500).json({
  success: false,
  message: "Failed to mark messages as read.",
});

}
};

// Get total unread messages for the logged-in organizer
const getOrganizerUnreadCount = async (req, res) => {
  try {
    const organizerId = req.user.user_id;

    if (req.user.role !== "organizer") {
      return res.status(403).json({
        success: false,
        message: "Only organizers can access this information.",
      });
    }

    const unreadCount = await Message.countDocuments({
      receiver: organizerId,
      isRead: false,
    });

    return res.status(200).json({
      success: true,
      unreadCount,
    });

  } catch (error) {
    console.error("Organizer unread message count error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch unread message count.",
    });
  }
};

const getUserUnreadCount = async (req, res) => {
  try {
    const userId = req.user.user_id;

    if (req.user.role !== "user") {
      return res.status(403).json({
        success: false,
        message: "Only users can access this information.",
      });
    }

    const unreadCount = await Message.countDocuments({
      receiver: userId,
      isRead: false,
    });

    return res.status(200).json({
      success: true,
      unreadCount,
    });

  } catch (error) {
    console.error("User unread message count error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch unread message count.",
    });
  }
};

// ==========================================
// ADMIN ↔ ORGANIZER MESSAGING
// ==========================================


// Send message between Admin and Organizer
const sendAdminOrganizerMessage = async (req, res) => {
  try {
    const senderId = req.user.user_id;
    const senderRole = req.user.role;

    const { receiverId, message } = req.body;

    if (!["admin", "organizer"].includes(senderRole)) {
      return res.status(403).json({
        success: false,
        message: "Only admins and organizers can send these messages.",
      });
    }

    if (!receiverId || !mongoose.isValidObjectId(receiverId)) {
      return res.status(400).json({
        success: false,
        message: "Valid receiver ID is required.",
      });
    }

    if (!message || !message.trim()) {
      return res.status(400).json({
        success: false,
        message: "Message cannot be empty.",
      });
    }

    if (message.trim().length > 2000) {
      return res.status(400).json({
        success: false,
        message: "Message cannot exceed 2000 characters.",
      });
    }

    // Admin can message organizers.
    // Organizers can message admins.
    const expectedRole =
      senderRole === "admin" ? "organizer" : "admin";

    const receiver = await User.findOne({
      _id: receiverId,
      role: expectedRole,
    });

    if (!receiver || receiver.isActive === false) {
      return res.status(404).json({
        success: false,
        message: "Receiver not found or inactive.",
      });
    }

    if (!receiver) {
      return res.status(404).json({
        success: false,
        message: "Receiver not found or inactive.",
      });
    }

    const newMessage = await Message.create({
      sender: senderId,
      receiver: receiverId,
      event: null,
      message: message.trim(),
    });

    await newMessage.populate([
      {
        path: "sender",
        select: "firstName lastName email role",
      },
      {
        path: "receiver",
        select: "firstName lastName email role",
      },
    ]);

    return res.status(201).json({
      success: true,
      message: "Message sent successfully.",
      data: newMessage,
    });
  } catch (error) {
    console.error("Admin organizer send message error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to send message.",
    });
  }
};


// Get all Admin conversations
const getAdminConversations = async (req, res) => {
  try {
    const adminId = req.user.user_id;

    if (req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Only admins can access these conversations.",
      });
    }

    const messages = await Message.find({
      event: null,
      $or: [
        { sender: adminId },
        { receiver: adminId },
      ],
    })
      .populate("sender", "firstName lastName email role image")
      .populate("receiver", "firstName lastName email role image")
      .sort({ createdAt: -1 });

    const conversations = new Map();

    messages.forEach((item) => {
      if (!item.sender || !item.receiver) return;

      const organizer =
        String(item.sender._id) === String(adminId)
          ? item.receiver
          : item.sender;

      if (organizer.role !== "organizer") return;

      const organizerId = String(organizer._id);

      if (!conversations.has(organizerId)) {
        conversations.set(organizerId, {
          organizer,
          lastMessage: item,
          unreadCount: 0,
        });
      }

      if (
        String(item.receiver._id) === String(adminId) &&
        !item.isRead
      ) {
        conversations.get(organizerId).unreadCount += 1;
      }
    });

    return res.status(200).json({
      success: true,
      message: "Admin conversations fetched successfully.",
      data: Array.from(conversations.values()),
    });
  } catch (error) {
    console.error("Admin conversations error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch admin conversations.",
    });
  }
};


// Get all Admin conversations for an Organizer
const getOrganizerAdminConversations = async (req, res) => {
  try {
    const organizerId = req.user.user_id;

    if (req.user.role !== "organizer") {
      return res.status(403).json({
        success: false,
        message: "Only organizers can access these conversations.",
      });
    }

    const messages = await Message.find({
      event: null,
      $or: [
        { sender: organizerId },
        { receiver: organizerId },
      ],
    })
      .populate("sender", "firstName lastName email role image")
      .populate("receiver", "firstName lastName email role image")
      .sort({ createdAt: -1 });

    const conversations = new Map();

    messages.forEach((item) => {
      if (!item.sender || !item.receiver) return;

      const admin =
        String(item.sender._id) === String(organizerId)
          ? item.receiver
          : item.sender;

      if (admin.role !== "admin") return;

      const adminId = String(admin._id);

      if (!conversations.has(adminId)) {
        conversations.set(adminId, {
          admin,
          lastMessage: item,
          unreadCount: 0,
        });
      }

      if (
        String(item.receiver._id) === String(organizerId) &&
        !item.isRead
      ) {
        conversations.get(adminId).unreadCount += 1;
      }
    });

    return res.status(200).json({
      success: true,
      message: "Organizer admin conversations fetched successfully.",
      data: Array.from(conversations.values()),
    });
  } catch (error) {
    console.error("Organizer admin conversations error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch admin conversations.",
    });
  }
};


// Get messages between Admin and Organizer
const getAdminOrganizerMessages = async (req, res) => {
  try {
    const currentUserId = req.user.user_id;
    const currentRole = req.user.role;
    const { userId } = req.params;

    if (!["admin", "organizer"].includes(currentRole)) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized access.",
      });
    }

    if (!mongoose.isValidObjectId(userId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID.",
      });
    }

    const expectedRole =
      currentRole === "admin" ? "organizer" : "admin";

    const otherUser = await User.findOne({
      _id: userId,
      role: expectedRole,
    });

    if (!otherUser) {
      return res.status(404).json({
        success: false,
        message: "Conversation user not found.",
      });
    }

    const messages = await Message.find({
      event: null,
      $or: [
        {
          sender: currentUserId,
          receiver: userId,
        },
        {
          sender: userId,
          receiver: currentUserId,
        },
      ],
    })
      .populate("sender", "firstName lastName email role image")
      .populate("receiver", "firstName lastName email role image")
      .sort({ createdAt: 1 });

    return res.status(200).json({
      success: true,
      message: "Messages fetched successfully.",
      data: messages,
    });
  } catch (error) {
    console.error("Admin organizer messages error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch messages.",
    });
  }
};


// Mark Admin ↔ Organizer messages as read
const markAdminMessagesAsRead = async (req, res) => {
  try {
    const currentUserId = req.user.user_id;
    const currentRole = req.user.role;
    const { userId } = req.params;

    if (!["admin", "organizer"].includes(currentRole)) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized access.",
      });
    }

    if (!mongoose.isValidObjectId(userId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID.",
      });
    }

    const expectedRole =
      currentRole === "admin" ? "organizer" : "admin";

    const otherUser = await User.findOne({
      _id: userId,
      role: expectedRole,
    });

    if (!otherUser) {
      return res.status(404).json({
        success: false,
        message: "Conversation user not found.",
      });
    }

    const result = await Message.updateMany(
      {
        event: null,
        sender: userId,
        receiver: currentUserId,
        isRead: false,
      },
      {
        $set: { isRead: true },
      }
    );

    return res.status(200).json({
      success: true,
      message: "Messages marked as read.",
      modifiedCount: result.modifiedCount,
    });
  } catch (error) {
    console.error("Admin organizer mark read error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to mark messages as read.",
    });
  }
};


// Get Admin unread message count
const getAdminUnreadCount = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Only admins can access this information.",
      });
    }

    const unreadCount = await Message.countDocuments({
      receiver: req.user.user_id,
      event: null,
      isRead: false,
    });

    return res.status(200).json({
      success: true,
      unreadCount,
    });
  } catch (error) {
    console.error("Admin unread count error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch unread count.",
    });
  }
};


// Get Organizer unread messages from Admin
const getOrganizerAdminUnreadCount = async (req, res) => {
  try {
    if (req.user.role !== "organizer") {
      return res.status(403).json({
        success: false,
        message: "Only organizers can access this information.",
      });
    }

    const adminIds = await User.find({
      role: "admin",
    }).distinct("_id");

    const unreadCount = await Message.countDocuments({
      sender: { $in: adminIds },
      receiver: req.user.user_id,
      event: null,
      isRead: false,
    });

    return res.status(200).json({
      success: true,
      unreadCount,
    });
  } catch (error) {
    console.error("Organizer admin unread count error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch unread count.",
    });
  }
};

// ==========================================
// ADMIN: GET ALL REGISTERED ORGANIZERS
// ==========================================

const getAllOrganizers = async (req, res) => {
  try {
    // Only admin can access this API
    if (req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Access denied. Admin only.",
      });
    }

    // Fetch all active organizers
    const organizers = await User.find({
      role: "organizer",
      isActive: { $ne: false },
    })
      .select(
        "firstName lastName email image organizerDetails.organizationName"
      )
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      message: "Organizers fetched successfully.",
      data: organizers,
    });
  } catch (error) {
    console.error("Get all organizers error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch organizers.",
      error: error.message,
    });
  }
};

module.exports = {
  sendMessage,
  getEventMessages,
  getOrganizerConversations,
  getUserConversations,
  markMessagesAsRead,
  getOrganizerUnreadCount,
  getUserUnreadCount,

  // Admin ↔ Organizer messaging functions
  sendAdminOrganizerMessage,
  getAdminConversations,
  getOrganizerAdminConversations,
  getAdminOrganizerMessages,
  markAdminMessagesAsRead,
  getAdminUnreadCount,
  getOrganizerAdminUnreadCount,

  // Admin: Get all organizers
  getAllOrganizers,

};
