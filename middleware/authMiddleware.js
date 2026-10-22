const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const authMiddleware = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    let token = null;

    // First, check the Authorization header
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.split(" ")[1];
    }

    // If there is no Bearer token, check the cookie
    if (!token && req.cookies) {
      token = req.cookies.token;
    }

    // If no token exists, return an error
    if (!token) {
      return res.status(401).json({
        message: "Authentication token is required",
      });
    }
    console.log(
  "RECEIVED TOKEN HASH:",
  crypto.createHash("sha256").update(token).digest("hex").slice(0, 12)
);
    // Verify the token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.user = decoded;

    next();
  } catch (error) {
    console.error("JWT ERROR:", error.name, error.message);

    return res.status(401).json({
      message: "Invalid or expired token",
    });
  }
};

module.exports = authMiddleware;