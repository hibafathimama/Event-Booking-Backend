const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/user");
const { validationResult } = require("express-validator");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const Notification = require("../models/notification");


const registerUser = async (req, res) => {
  try {
    // Validation
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
      return res.status(422).json({
        message: errors.array()[0].msg,
      });
    }

    const {
      firstName,
      lastName,
      email,
      password,
      role,
      organizationName,
      contactNumber,
      organizationType,
      organizationAddress,
      organizationDescription,
      website,
    } = req.body;

    // Check required fields
    if (!firstName || !lastName || !email || !password) {
      return res.status(400).json({
        message: "All fields are required",
      });
    }

    // Profile image is required
    if (!req.file) {
      return res.status(400).json({
        message: "Profile image is required",
      });
    }

    // Only user and organizer registration are allowed publicly
    const selectedRole = role || "user";

    if (!["user", "organizer"].includes(selectedRole)) {
      return res.status(400).json({
        message: "Invalid registration role",
      });
    }

    // Organizer details validation
    if (selectedRole === "organizer") {
      if (
        !organizationName?.trim() ||
        !contactNumber?.trim() ||
        !organizationType?.trim() ||
        !organizationAddress?.trim() ||
        !organizationDescription?.trim()
      ) {
        return res.status(400).json({
          message: "All organizer details are required",
        });
      }
    }

    // Check if email already exists
    const existingUser = await User.findOne({
      email: email.trim().toLowerCase(),
    });

    if (existingUser) {
      return res.status(400).json({
        message: "Email already registered",
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Get uploaded profile image path
    const image = `/uploads/profiles/${req.file.filename}`;

    // Organizer details
    const organizerDetails =
      selectedRole === "organizer"
        ? {
            organizationName: organizationName.trim(),
            contactNumber: contactNumber.trim(),
            organizationType: organizationType.trim(),
            organizationAddress: organizationAddress.trim(),
            organizationDescription: organizationDescription.trim(),
            website: website?.trim() || "",
          }
        : undefined;

    // Verification status
    const verificationStatus =
      selectedRole === "organizer" ? "pending" : "approved";

    // Create user
    const user = await User.create({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim().toLowerCase(),
      password: hashedPassword,
      role: selectedRole,
      verificationStatus,
      image,
      ...(organizerDetails && { organizerDetails }),
    });

    // Notify admin when a new organizer registers
    if (selectedRole === "organizer") {
      await Notification.create({
        message: `New organizer registration: ${user.firstName} ${user.lastName} requires verification.`,
        type: "organizer_verification",
        organizer: user._id,
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        user_id: user._id,
        role: user.role,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: process.env.JWT_TOKEN_EXPIRY || "1d",
      }
    );

    // Send response
    return res.status(201).json({
      status: true,
      message:
        selectedRole === "organizer"
          ? "Registration successful! Your account is awaiting admin verification."
          : "Registration successful!",
      data: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        verificationStatus: user.verificationStatus,
        image: user.image,
        organizerDetails: user.organizerDetails,
      },
      accessToken: token,
    });
  } catch (error) {
    console.log("REGISTER USER ERROR:", error);

    res.status(500).json({
      message: "Registration failed",
    });
  }
};



const loginUser = async (req, res) => {
  try {
    // Validation
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
      return res.status(422).json({
        message: errors.array()[0].msg,
      });
    }

    const { email, password } = req.body;

    // Check required fields
    if (!email || !password) {
      return res.status(400).json({
        message: "Email and password are required",
      });
    }

    // Find user by email
    const user = await User.findOne({ email }).select(
      "_id firstName lastName email role password verificationStatus"
    );

    // Check if user exists
    if (!user) {
      return res.status(401).json({
        message: "Invalid Email or password",
      });
    }

    // Compare entered password with hashed password
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({
        message: "Invalid email or password",
      });
    }

    // Check whether the organizer is approved
    if (
      user.role === "organizer" &&
      user.verificationStatus !== "approved"
    ) {
      return res.status(403).json({
        status: false,
        message:
          user.verificationStatus === "rejected"
            ? "Your organizer application has been rejected. Please contact the admin."
            : "Your account is awaiting admin approval. You cannot log in yet.",
      });
    }

    // Create JWT token
    const token = jwt.sign(
      {
        user_id: user._id,
        role: user.role,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: process.env.JWT_TOKEN_EXPIRY || "1d",
      }
    );

    console.log("New JWT generated during login");

    // Send response
    return res.status(200).json({
      status: true,
      message: "Login successful!",
      data: {
        _id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        verificationStatus: user.verificationStatus,
      },
      accessToken: token,
    });

  } catch (error) {
    console.error("Login error:", error);

    return res.status(500).json({
      message: error.message || "Internal server error",
    });
  }
};

// Get logged-in user's profile
const getMyProfile = async (req, res) => {
  try {
    const userId = req.user.user_id;

    const user = await User.findById(userId).select("-password");

    if (!user) {
      return res.status(404).json({
        status: false,
        message: "User not found",
      });
    }

    return res.status(200).json({
      status: true,
      message: "Profile fetched successfully",
      data: user,
    });
  } catch (error) {
    console.error("GET MY PROFILE ERROR:", error);

    return res.status(500).json({
      status: false,
      message: "Failed to fetch profile",
    });
  }
};

const updateMyProfile = async (req, res) => {
  try {
    const userId = req.user.user_id;

    const { firstName, lastName, email } = req.body;

    // Check whether at least one field or image is provided
    if (
      firstName === undefined &&
      lastName === undefined &&
      email === undefined &&
      !req.file
    ) {
      return res.status(400).json({
        status: false,
        message: "Please provide at least one field to update",
      });
    }

    // Validate first name, last name and email
    if (
      (firstName !== undefined &&
        (typeof firstName !== "string" || !firstName.trim())) ||
      (lastName !== undefined &&
        (typeof lastName !== "string" || !lastName.trim())) ||
      (email !== undefined &&
        (typeof email !== "string" ||
          !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())))
    ) {
      return res.status(400).json({
        status: false,
        message: "Please provide valid profile details",
      });
    }

    // Check whether another user already uses this email
    if (email !== undefined) {
      const existingUser = await User.findOne({
        email: email.trim().toLowerCase(),
        _id: { $ne: userId },
      });

      if (existingUser) {
        return res.status(409).json({
          status: false,
          message: "Email is already registered",
        });
      }
    }

    // Prepare fields to update
    const updates = {};

    if (firstName !== undefined) {
      updates.firstName = firstName.trim();
    }

    if (lastName !== undefined) {
      updates.lastName = lastName.trim();
    }

    if (email !== undefined) {
      updates.email = email.trim().toLowerCase();
    }

    // Update profile image
    if (req.file) {
      updates.image = `/uploads/profiles/${req.file.filename}`;
    }

    // Update user in MongoDB
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $set: updates },
      {
        new: true,
        runValidators: true,
      }
    ).select("-password");

    if (!updatedUser) {
      return res.status(404).json({
        status: false,
        message: "User not found",
      });
    }

    return res.status(200).json({
      status: true,
      message: "Profile updated successfully",
      data: updatedUser,
    });
  } catch (error) {
    console.error("UPDATE MY PROFILE ERROR:", error);

    return res.status(500).json({
      status: false,
      message: "Failed to update profile",
    });
  }
};


// Change Password
const changePassword = async (req, res) => {
    try {
        const userId = req.user.user_id;

        const { currentPassword, newPassword } = req.body;

        // Check whether both passwords are provided
        if (!currentPassword || !newPassword) {
            return res.status(400).json({
                status: false,
                message: "Current password and new password are required"
            });
        }

        // Check new password length
        if (newPassword.length < 8) {
            return res.status(400).json({
                status: false,
                message: "New password must be at least 8 characters long"
            });
        }

        // Find the logged-in user
        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({
                status: false,
                message: "User not found"
            });
        }

        // Verify the current password
        const isMatch = await bcrypt.compare(
            currentPassword,
            user.password
        );

        if (!isMatch) {
            return res.status(400).json({
                status: false,
                message: "Current password is incorrect"
            });
        }

        // Prevent reusing the current password
        const samePassword = await bcrypt.compare(
            newPassword,
            user.password
        );

        if (samePassword) {
            return res.status(400).json({
                status: false,
                message: "New password must be different from current password"
            });
        }

        // Hash the new password
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        // Save the new password
        user.password = hashedPassword;
        await user.save();

        return res.status(200).json({
            status: true,
            message: "Password changed successfully"
        });

    } catch (error) {
        console.error("CHANGE PASSWORD ERROR:", error);

        return res.status(500).json({
            status: false,
            message: "Failed to change password"
        });
    }
};


const forgotPassword = async (req, res) => {
    try {
        console.log("FORGOT PASSWORD FUNCTION CALLED");
        const { email } = req.body;

        // Check whether email was provided
        if (!email) {
            return res.status(400).json({
                status: false,
                message: "Email is required"
            });
        }

        // Find user by email
        const user = await User.findOne({
            email: email.trim().toLowerCase()
        });
        console.log("Forgot password email:", email);
        console.log("User found:", !!user);

        // Do not reveal whether an account exists
        if (!user) {
            return res.status(200).json({
                status: true,
                message: "If the account exists, a reset link will be sent"
            });
        }

        // Generate a secure reset token
        const resetToken = crypto.randomBytes(32).toString("hex");

        // Store only the hashed token in the database
        const hashedToken = crypto
            .createHash("sha256")
            .update(resetToken)
            .digest("hex");

        user.resetPasswordToken = hashedToken;

        // Token expires after 10 minutes
        user.resetPasswordExpires = Date.now() + 10 * 60 * 1000;

        await user.save();

        // Configure email sender
        const transporter = nodemailer.createTransport({
            service: "gmail",
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS
            }
        });

        // Create reset link
        const resetLink =
            `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;

            // Send email
            const info = await transporter.sendMail({
                from: process.env.EMAIL_USER,
                to: user.email,
                subject: "Password Reset Request",
                html: `
                    <h2>Password Reset</h2>
                    <p>You requested to reset your password.</p>
                    <p>This link expires in 10 minutes.</p>
                    <a href="${resetLink}">Reset Password</a>
                    <p>If you did not request this, ignore this email.</p>
                `
            });

            console.log("Email accepted by server:", info.accepted);
            console.log("Email rejected:", info.rejected);
            console.log("Message ID:", info.messageId);

        return res.status(200).json({
            status: true,
            message: "If the account exists, a reset link will be sent"
        });

    } catch (error) {
        console.error("FORGOT PASSWORD ERROR:", error);

        return res.status(500).json({
            status: false,
            message: "Failed to process password reset request"
        });
    }
};

module.exports = {
  registerUser,
  loginUser,
  getMyProfile,
  updateMyProfile,
  changePassword,
  forgotPassword
};
     




