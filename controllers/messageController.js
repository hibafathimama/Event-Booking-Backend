const Message = require("../models/message");
const Event = require("../models/event");

// Send a message to an event organizer
const sendMessage = async (req, res) => {
try {
const { eventId, message } = req.body;

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

const event = await Event.findById(eventId);

if (!event) {
  return res.status(404).json({
    success: false,
    message: "Event not found.",
  });
}

// Assumes the event model has an "organizer" field.
const organizerId = event.organizer;

if (!organizerId) {
  return res.status(400).json({
    success: false,
    message: "This event has no assigned organizer.",
  });
}

const senderId = req.user.user_id;

if (String(senderId) === String(organizerId)) {
  return res.status(400).json({
    success: false,
    message: "You cannot message yourself about your own event.",
  });
}

const newMessage = await Message.create({
  sender: senderId,
  receiver: organizerId,
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

// Get messages for an event conversation
const getEventMessages = async (req, res) => {
try {
const { eventId } = req.params;
const currentUserId = req.user.user_id;

const event = await Event.findById(eventId);

if (!event) {
  return res.status(404).json({
    success: false,
    message: "Event not found.",
  });
}

const organizerId = event.organizer;
const isOrganizer =
  String(currentUserId) === String(organizerId);

const filter = {
  event: event._id,
  $or: [
    { sender: currentUserId },
    { receiver: currentUserId },
  ],
};

// Organizers can view messages only for their own events.
if (isOrganizer) {
  filter.$or = [
    { sender: organizerId },
    { receiver: organizerId },
  ];
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

module.exports = {
sendMessage,
getEventMessages,
};
