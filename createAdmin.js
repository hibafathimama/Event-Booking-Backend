const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
require("dotenv").config();

const User = require("./models/user");

const createAdmin = async () => {
try {
await mongoose.connect(process.env.MONGO_URL, {
dbName: "event-booking",
});

console.log("MongoDB connected");

const email = "hibaazeez@gmail.com";
const password = "Admin@123";

const existingAdmin = await User.findOne({ email });

const hashedPassword = await bcrypt.hash(password, 10);

if (existingAdmin) {
  existingAdmin.password = hashedPassword;
  existingAdmin.role = "admin";

  await existingAdmin.save();

  console.log("Existing account updated as admin");
} else {
  await User.create({
    firstName: "Hiba",
    lastName: "Fathima",
    email,
    password: hashedPassword,
    role: "admin",
  });

  console.log("Admin created successfully");
}

console.log("Admin email:", email);
console.log("Admin password:", password);

} catch (error) {
console.error("Error creating admin:", error);
} finally {
await mongoose.disconnect();
}
};

createAdmin();
