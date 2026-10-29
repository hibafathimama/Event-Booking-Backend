const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");

const {
createRazorpayOrder,
verifyRazorpayPayment,
} = require("../controllers/razorpayController");

router.post(
"/create-order",
authMiddleware,
roleMiddleware(["user"]),
createRazorpayOrder
);

router.post(
"/verify",
authMiddleware,
roleMiddleware(["user"]),
verifyRazorpayPayment
);

module.exports = router;
