const Favorite = require("../models/favorite");
const Event = require("../models/event");

// Add an event to the wishlist
const addFavorite = async (req, res) => {
try {
const { eventId } = req.body;
const userId = req.user.user_id;

if (!eventId) {
  return res.status(400).json({
    success: false,
    message: "Event ID is required.",
  });
}

const eventExists = await Event.findOne({
  _id: eventId,
  isActive: true,
});

if (!eventExists) {
  return res.status(404).json({
    success: false,
    message: "Event not found or unavailable.",
  });
}

const existingFavorite = await Favorite.findOne({
  user: userId,
  event: eventId,
});

if (existingFavorite) {
  return res.status(409).json({
    success: false,
    message: "Event is already in your wishlist.",
  });
}

const favorite = await Favorite.create({
  user: userId,
  event: eventId,
});

return res.status(201).json({
  success: true,
  message: "Event added to wishlist successfully.",
  data: favorite,
});


} catch (error) {
if (error.code === 11000) {
return res.status(409).json({
success: false,
message: "Event is already in your wishlist.",
});
}


console.error("Add favorite error:", error.message);

return res.status(500).json({
  success: false,
  message: "Unable to add event to wishlist.",
});


}
};

// Get the logged-in user's wishlist
const getFavorites = async (req, res) => {
try {
const userId = req.user.user_id;

const favorites = await Favorite.find({
  user: userId,
})
  .populate("event")
  .sort({ createdAt: -1 });

return res.status(200).json({
  success: true,
  message: "Wishlist fetched successfully.",
  data: favorites,
});

} catch (error) {
console.error("Get favorites error:", error.message);

return res.status(500).json({
  success: false,
  message: "Unable to fetch wishlist.",
});

}
};

// Remove an event from the wishlist
const removeFavorite = async (req, res) => {
try {
const { eventId } = req.params;
const userId = req.user.user_id;

if (!eventId) {
  return res.status(400).json({
    success: false,
    message: "Event ID is required.",
  });
}

const favorite = await Favorite.findOneAndDelete({
  user: userId,
  event: eventId,
});

if (!favorite) {
  return res.status(404).json({
    success: false,
    message: "Favorite event not found.",
  });
}

return res.status(200).json({
  success: true,
  message: "Event removed from wishlist successfully.",
});

} catch (error) {
console.error("Remove favorite error:", error.message);

return res.status(500).json({
  success: false,
  message: "Unable to remove event from wishlist.",
});

}
};

module.exports = {
addFavorite,
getFavorites,
removeFavorite,
};
