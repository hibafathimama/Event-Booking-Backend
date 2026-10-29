const mongoose = require("mongoose");

const favoriteSchema = new mongoose.Schema(
{
user: {
type: mongoose.Schema.Types.ObjectId,
ref: "User",
required: true,
},

event: {
  type: mongoose.Schema.Types.ObjectId,
  ref: "Event",
  required: true,
},

},
{
timestamps: true,
}
);

// Prevent the same user from adding the same event more than once.
favoriteSchema.index(
{ user: 1, event: 1 },
{ unique: true }
);

module.exports = mongoose.model("Favorite", favoriteSchema);
