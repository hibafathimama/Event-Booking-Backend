
const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    message: {
      type: String,
      required: true,
    },

    type: {
      type: String,
      enum: [
        "organizer_verification",
        "booking_confirmation",
        "booking_cancellation",
        "event_update",
        "announcement",
      ],
      required: true,
    },

    organizer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: function () {
        return (
          this.type === "organizer_verification" ||
          this.type === "event_update"
        );
      },
    },

    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: function () {
        return (
          this.type !== "organizer_verification" &&
          this.type !== "event_update"
        );
      },
    },

    isRead: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Notification", notificationSchema);
