const { param, validationResult } = require("express-validator");

// Validate MongoDB ID
const validateId = [
    param("id")
        .isMongoId()
        .withMessage("Invalid ID format"),

    (req, res, next) => {
        const errors = validationResult(req);

        if (!errors.isEmpty()) {
            return res.status(400).json({
                status: false,
                message: "Validation failed",
                errors: errors.array()
            });
        }

        next();
    }
];

module.exports = {
    validateId
};