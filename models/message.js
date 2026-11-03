const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
{
sender: {
type: mongoose.Schema.Types.ObjectId,
ref: "User",
required: true,
},

receiver: {
  type: mongoose.Schema.Types.ObjectId,
  ref: "User",
  required: true,
},

event: {
  type: mongoose.Schema.Types.ObjectId,
  ref: "Event",
  required: true,
},

message: {
  type: String,
  required: true,
  trim: true,
  maxlength: 2000,
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

module.exports = mongoose.model("Message", messageSchema);
