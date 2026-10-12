const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/user");
const { validationResult } = require("express-validator");
const crypto = require("crypto");
const nodemailer = require("nodemailer");

const registerUser = async (req, res) => {
  try {
    //validation
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
      return res.status(422).json({
        message: errors.array()[0].msg,
      });
    }

    const { firstName, lastName, email, password, role } = req.body;

    // Check required fields
    if (!firstName || !lastName || !email || !password) {
      return res.status(400).json({
        message: "All fields are required",
      });
    }

    // Check if email already exists
    const existingUser = await User.findOne({ email });

    if (existingUser) {
      return res.status(400).json({
        message: "Email already registered",
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const user = await User.create({
      firstName,
      lastName,
      email,
      password: hashedPassword,
      role: role || "user",
    });

    //token
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

    res.status(201).json({
      message: "User registered successfully",
      data: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
      },
      accessToken: token,
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      message: "Registration failed",
    });
  }
};



const loginUser=async(req,res)=>{
  try{
    //validation
      const errors = validationResult(req);

      if (!errors.isEmpty()) {
        return res.status(422).json({
          message: errors.array()[0].msg,
        });
      }

    const {email,password} = req.body;

    //check required fields

    if(!email || !password){
      return res.status(400).json({
        message:"Email and password are required"
      });
    }

    //find user by email
    const user=await User.findOne({email}).select(
      "_id firstName lastName email role password"
    );

    //check if user exist 
    if(!user){
      return res.status(401).json({
        message:"Invalid Email or password",
      });
    }

    //compared entered password with hashed password
    const isMatch = await bcrypt.compare (password,user.password);

    if(!isMatch){
      return res.status(401).json({
        message:"Invalid email or password"
      });
    }

    //create JWT token

    const token=jwt.sign(
      {
        user_id:user._id,
        role:user.role,
      },
      process.env.JWT_SECRET,
      {
        expiresIn:process.env.JWT_TOKEN_EXPIRY || "1d",
      }
    );

    //send response 
    return res.status(200).json({
      status:true,
      message:"User logges successfully",
      data:{
        firstName:user.firstName,
        lastName:user.lastName,
        email:user.email,
        role:user.role
      },
      accessToken:token,
    });
  }catch(error){
    return res.status(500).json({
      message:error.message ||"internal server error",
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
                message: "User not found"
            });
        }

        return res.status(200).json({
            status: true,
            message: "Profile fetched successfully",
            data: user
        });

    } catch (error) {
        console.error("GET MY PROFILE ERROR:", error);

        return res.status(500).json({
            status: false,
            message: "Failed to fetch profile"
        });
    }
};

const updateMyProfile = async (req, res) => {
    try {
        const userId = req.user.user_id;

        const { firstName, lastName, email } = req.body;

        // Check whether at least one field is provided
        if (
            firstName === undefined &&
            lastName === undefined &&
            email === undefined
        ) {
            return res.status(400).json({
                status: false,
                message: "Please provide at least one field to update"
            });
        }

        // Validate the provided fields
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
                message: "Please provide valid profile details"
            });
        }

        // Check whether another user already uses this email
        if (email !== undefined) {
            const existingUser = await User.findOne({
                email: email.trim().toLowerCase(),
                _id: { $ne: userId }
            });

            if (existingUser) {
                return res.status(409).json({
                    status: false,
                    message: "Email is already registered"
                });
            }
        }

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

        const updatedUser = await User.findByIdAndUpdate(
            userId,
            { $set: updates },
            { new: true, runValidators: true }
        ).select("-password");

        if (!updatedUser) {
            return res.status(404).json({
                status: false,
                message: "User not found"
            });
        }

        return res.status(200).json({
            status: true,
            message: "Profile updated successfully",
            data: updatedUser
        });

    } catch (error) {
        console.error("UPDATE MY PROFILE ERROR:", error);

        return res.status(500).json({
            status: false,
            message: "Failed to update profile"
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
     




