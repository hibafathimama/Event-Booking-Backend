const Message = require("../models/message");
const Event = require("../models/event");
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

module.exports = {
sendMessage,
getEventMessages,
getOrganizerConversations,
getUserConversations,
markMessagesAsRead
};
