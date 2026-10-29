const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");

const {
addFavorite,
getFavorites,
removeFavorite,
} = require("../controllers/favoriteController");

// Get all favorites for the logged-in user
router.get(
"/",
authMiddleware,
roleMiddleware(["user"]),
getFavorites
);

// Add an event to the wishlist
router.post(
"/",
authMiddleware,
roleMiddleware(["user"]),
addFavorite
);

// Remove an event from the wishlist
router.delete(
"/:eventId",
authMiddleware,
roleMiddleware(["user"]),
removeFavorite
);

module.exports = router;
