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

    const existingAdmin = await User.findOne({
    email: "anotheradmin@gmail.com"
    });

    if (existingAdmin) {
      console.log("Admin already exists");
      process.exit();
    }

    const hashedPassword = await bcrypt.hash("Admin@123", 10);

    await User.create({
      firstName: "Hiba",
      lastName: "Fathima",
      email: "hibaazeez@gmail.com",
      password: hashedPassword,
      role: "admin",
    });

    console.log("Admin created successfully");

    process.exit();

  } catch (error) {
    console.log("Error creating admin:", error);
    process.exit(1);
  }
};

createAdmin();