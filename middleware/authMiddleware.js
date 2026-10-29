const jwt = require("jsonwebtoken");

const authMiddleware = (req, res, next) => {
  try {
    let token = null;

    // 1. Get the token from the Authorization header
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.slice(7).trim();
    }

    // 2. If there is no token in the header, check cookies
    if (!token && req.cookies?.token) {
      token = req.cookies.token;
    }

    // 3. Check whether a token exists
    if (!token) {
      return res.status(401).json({
        message: "Authentication token is required",
      });
    }

    // 4. Check whether JWT_SECRET is configured
    if (!process.env.JWT_SECRET) {
      console.error("JWT_SECRET is missing from the backend environment.");
      
      return res.status(500).json({
        message: "Server authentication configuration error",
      });
    }

    // 5. Verify the token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 6. Store decoded user information for the next middleware/controller
    req.user = decoded;

    next();
  } catch (error) {
    console.error("Authentication error:", error.name);

    if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        message: "Your session has expired. Please log in again.",
      });
    }

    return res.status(401).json({
      message: "Invalid or expired token. Please log in again.",
    });
  }
};

module.exports = authMiddleware;