const mongoose = require("mongoose");

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URL, {
            dbName: "event-booking",
        });

        console.log("MongoDB connected successfully");
    } catch (error) {
        console.log("MongoDB connection failed:");
        console.log(error);
    }
};

module.exports = connectDB;