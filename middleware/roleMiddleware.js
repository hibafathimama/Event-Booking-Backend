const roleMiddleware = (allowedRoles) => {
  return (req, res, next) => {

    if (!req.user) {
      return res.status(401).json({
        message: "User authentication data is missing",
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        message: "You are not authorized",
      });
    }

    next();
  };
};

module.exports = roleMiddleware;