const express = require("express");

const {
  registerUser,
  loginUser,
  getMyProfile,
  updateMyProfile,
  changePassword,
  forgotPassword
} = require("../controllers/userController");

const { check } = require("express-validator");

const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");

router.post(
  "/register",
  [
    check("firstName")
      .notEmpty()
      .withMessage("First name is required"),

    check("lastName")
      .notEmpty()
      .withMessage("Last name is required"),

    check("email")
      .notEmpty()
      .withMessage("Email is required")
      .isEmail()
      .withMessage("Enter a valid email"),

    check("password")
      .notEmpty()
      .withMessage("Password is required")
      .isLength({ min: 6 })
      .withMessage("Password must be at least 6 characters"),

    check("role")
      .optional()
      .isIn(["user", "organizer"])
      .withMessage("Invalid role"),
  ],
  registerUser
);

router.post(
  "/login",
  [
    check("email")
      .notEmpty()
      .withMessage("Email is required")
      .isEmail()
      .withMessage("Enter a valid email"),

    check("password")
      .notEmpty()
      .withMessage("Password is required"),
  ],
  loginUser
);

router.get(
    "/my-profile",
    authMiddleware,
    getMyProfile
);

router.put(
    "/my-profile",
    authMiddleware,
    updateMyProfile
);

router.put(
    "/change-password",
    authMiddleware,
    changePassword
);

router.post("/forgot-password", forgotPassword);

module.exports = router;