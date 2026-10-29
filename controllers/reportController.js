const Report = require("../models/report");
const mongoose = require("mongoose");

// Get all reports for admin
const getAllReports = async (req, res) => {
  try {
    const { status } = req.query;
    const filter = {};

    if (status) {
      const allowedStatuses = [
        "pending",
        "reviewed",
        "resolved",
        "dismissed",
      ];

      if (!allowedStatuses.includes(status)) {
        return res.status(400).json({
          status: false,
          message: "Invalid report status",
        });
      }

      filter.status = status;
    }

    const reports = await Report.find(filter)
      .populate("reportedBy", "firstName lastName email")
      .populate("event", "eventName date time venue location")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      status: true,
      message: "Reports fetched successfully",
      data: reports,
    });
  } catch (error) {
    console.error("GET ALL REPORTS ERROR:", error);

    return res.status(500).json({
      status: false,
      message: error.message || "Failed to fetch reports",
    });
  }
};

// Update report status and admin note
const updateReport = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, adminNote } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: false,
        message: "Invalid report ID",
      });
    }

    const allowedStatuses = [
      "pending",
      "reviewed",
      "resolved",
      "dismissed",
    ];

    if (status !== undefined && !allowedStatuses.includes(status)) {
      return res.status(400).json({
        status: false,
        message: "Invalid report status",
      });
    }

    if (
      adminNote !== undefined &&
      typeof adminNote !== "string"
    ) {
      return res.status(400).json({
        status: false,
        message: "Admin note must be text",
      });
    }

    const updates = {};

    if (status !== undefined) {
      updates.status = status;
    }

    if (adminNote !== undefined) {
      updates.adminNote = adminNote.trim();
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        status: false,
        message: "Provide a status or admin note to update",
      });
    }

    const report = await Report.findByIdAndUpdate(
      id,
      { $set: updates },
      {
        new: true,
        runValidators: true,
      }
    )
      .populate("reportedBy", "firstName lastName email")
      .populate("event", "eventName date time venue location");

    if (!report) {
      return res.status(404).json({
        status: false,
        message: "Report not found",
      });
    }

    return res.status(200).json({
      status: true,
      message: "Report updated successfully",
      data: report,
    });
  } catch (error) {
    console.error("UPDATE REPORT ERROR:", error);

    return res.status(500).json({
      status: false,
      message: error.message || "Failed to update report",
    });
  }
};


const createReport = async (req, res) => {
try {
const { event, reason, description } = req.body;

// Validate required fields
if (!event || !reason || !reason.trim()) {
  return res.status(400).json({
    message: "Event and report reason are required.",
  });
}

// Check whether the event exists
const Event = require("../models/event");
const eventExists = await Event.findById(event);

if (!eventExists) {
  return res.status(404).json({
    message: "Event not found.",
  });
}

// Create and save the report
const Report = require("../models/report");

const report = await Report.create({
  reportedBy: req.user.user_id,
  event,
  reason: reason.trim(),
  description: description?.trim() || "",
});

return res.status(201).json({
  message: "Report submitted successfully.",
  data: report,
});

} catch (error) {
console.error("Create report error:", error);

return res.status(500).json({
  message: "Failed to submit report.",
});

}
};


module.exports = {
  getAllReports,
  updateReport,
  createReport
};

