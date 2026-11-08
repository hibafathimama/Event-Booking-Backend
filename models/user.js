const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    firstName: {
      type: String,
      required: true,
      trim: true,
    },

    lastName: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },

    password: {
      type: String,
      required: true,
    },

    role: {
      type: String,
      enum: ["user", "organizer", "admin"],
      default: "user",
    },
    isActive: {
  type: Boolean,
  default: true,
},

    // Organizer details
    organizerDetails: {
      organizationName: {
        type: String,
        trim: true,
        default: "",
      },

      contactNumber: {
        type: String,
        trim: true,
        default: "",
      },

      organizationType: {
        type: String,
        trim: true,
        default: "",
      },

      organizationAddress: {
        type: String,
        trim: true,
        default: "",
      },

      organizationDescription: {
        type: String,
        trim: true,
        default: "",
      },

      website: {
        type: String,
        trim: true,
        default: "",
      },
    },

    // Organizer verification status
    verificationStatus: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },

    resetPasswordToken: {
      type: String,
      default: null,
    },

    resetPasswordExpires: {
      type: Date,
      default: null,
    },

    image: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

const User = mongoose.model("User", userSchema);

module.exports = User;