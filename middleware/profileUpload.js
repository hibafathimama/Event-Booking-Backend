const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Folder to store profile images
const uploadDir = path.join(__dirname, "../uploads/profiles");

// Create the folder automatically if it doesn't exist
fs.mkdirSync(uploadDir, { recursive: true });

// Configure where and how to save images
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },

  filename: (req, file, cb) => {
    const uniqueName =
      Date.now() +
      "-" +
      Math.round(Math.random() * 1e9) +
      path.extname(file.originalname).toLowerCase();

    cb(null, uniqueName);
  },
});

// Allow only JPG, PNG, and WEBP images
const fileFilter = (req, file, cb) => {
  const allowedTypes = ["image/jpeg", "image/png", "image/webp"];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Only JPG, PNG and WEBP images are allowed."));
  }
};

// Configure Multer
const profileUpload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 2 * 1024 * 1024, // Maximum 2 MB
  },
});

module.exports = profileUpload;
