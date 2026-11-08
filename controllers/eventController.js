const Event =require("../models/event")
const { validationResult } = require("express-validator");
const Booking = require("../models/booking");
const Notification = require("../models/notification");
const Report = require("../models/report");

//create event
const createEvent = async (req, res) => {
  try {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
      return res.status(422).json({
        message: errors.array()[0].msg,
      });
    }

    const {
      eventName,
      category,
      date,
      time,
      venue,
      location,
      description,
      ticketPrice,
      totalSeats,
      seatingType = "general",
      seats,
    } = req.body;

    const image = req.file ? req.file.path : null;

    // 1. Validate required fields
    if (
      !eventName ||
      !category ||
      !date ||
      !time ||
      !venue ||
      !location ||
      !description ||
      ticketPrice === undefined ||
      ticketPrice === "" ||
      totalSeats === undefined
    ) {
      return res.status(400).json({
        message: "All fields are required",
      });
    }

    // 2. Validate ticket price
    const price = Number(ticketPrice);

    if (
      !Number.isFinite(price) ||
      price < 0
    ) {
      return res.status(400).json({
        message: "Please enter a valid ticket price",
      });
    }

    // 3. Validate total seats
    const seatCount = Number(totalSeats);

    if (
      !Number.isInteger(seatCount) ||
      seatCount < 1
    ) {
      return res.status(400).json({
        message: "Invalid total seats",
      });
    }

    // 4. Validate seating type
    if (!["general", "reserved"].includes(seatingType)) {
      return res.status(400).json({
        message: "Invalid seating type",
      });
    }

    let eventSeats = [];

    // 5. Validate individual seats for reserved seating
    if (seatingType === "reserved") {
      try {
        eventSeats =
          typeof seats === "string"
            ? JSON.parse(seats)
            : seats;
      } catch (error) {
        return res.status(400).json({
          message: "Invalid seats data",
        });
      }

      if (
        !Array.isArray(eventSeats) ||
        eventSeats.length !== seatCount
      ) {
        return res.status(400).json({
          message:
            "The number of seats must match total seats",
        });
      }

      const seatNumbers = eventSeats.map((seat) =>
        typeof seat === "string"
          ? seat.trim()
          : seat.seatNumber?.trim()
      );

      if (
        seatNumbers.some((seat) => !seat) ||
        new Set(seatNumbers).size !== seatNumbers.length
      ) {
        return res.status(400).json({
          message:
            "Seat numbers must be valid and unique",
        });
      }

      eventSeats = seatNumbers.map((seatNumber) => ({
        seatNumber,
        status: "available",
      }));
    }

    // 6. Create event
    const event = await Event.create({
      eventName,
      category,
      date,
      time,
      venue,
      location,
      description,

      // Single ticket price
      ticketPrice: price,

      totalSeats: seatCount,
      availableSeats: seatCount,
      seatingType,
      seats: eventSeats,
      image,
      organizer: req.user.user_id,
    });

    // 7. Send response
    return res.status(201).json({
      status: true,
      message: "Event created successfully",
      data: event,
    });

  } catch (error) {
    console.error("Create Event Error:", error);

    return res.status(500).json({
      status: false,
      message: error.message,
    });
  }
};



// Get all upcoming events with pagination
const getAllEvents = async (req, res) => {
  try {
    const {
      search,
      category,
      location,
      date,
      minPrice,
      maxPrice,
      page = 1,
      limit = 9,
    } = req.query;

    const now = new Date();

    // Start of today
    const todayStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    );

    // Show only active upcoming events
    const filter = {
      isActive: true,
      date: {
        $gte: todayStart,
      },
    };

    // Exclude events reported by the logged-in user
    if (req.user && req.user.user_id) {
      const reportedEventIds = await Report.distinct("event", {
        reportedBy: req.user.user_id,
      });

      filter._id = {
        $nin: reportedEventIds,
      };
    }

    // Search by event name
    if (search) {
      filter.eventName = {
        $regex: search,
        $options: "i",
      };
    }

    // Filter by category
    if (category) {
      filter.category = {
        $regex: category,
        $options: "i",
      };
    }

    // Filter by location
    if (location) {
      filter.location = {
        $regex: location,
        $options: "i",
      };
    }

    // Filter by selected date
    if (date) {
      const selectedDate = new Date(date);

      if (Number.isNaN(selectedDate.getTime())) {
        return res.status(400).json({
          status: false,
          message: "Invalid date.",
        });
      }

      const startDate = new Date(selectedDate);
      startDate.setHours(0, 0, 0, 0);

      const endDate = new Date(selectedDate);
      endDate.setHours(23, 59, 59, 999);

      // Do not show events from previous dates
      if (endDate < todayStart) {
        return res.status(200).json({
          status: true,
          message: "Events fetched successfully.",
          data: [],
          pagination: {
            totalEvents: 0,
            currentPage: 1,
            totalPages: 0,
            limit: Number(limit) || 9,
          },
        });
      }

      filter.date = {
        $gte: startDate > todayStart ? startDate : todayStart,
        $lte: endDate,
      };
    }

    // Filter by ticket price
    if (minPrice !== undefined || maxPrice !== undefined) {
      filter.ticketPrice = {};

      if (minPrice !== undefined && minPrice !== "") {
        filter.ticketPrice.$gte = Number(minPrice);
      }

      if (maxPrice !== undefined && maxPrice !== "") {
        filter.ticketPrice.$lte = Number(maxPrice);
      }
    }

    // Pagination
    const currentPage = Math.max(1, Number(page) || 1);
    const pageLimit = Math.max(1, Number(limit) || 9);
    const skip = (currentPage - 1) * pageLimit;

    // Fetch events
    let upcomingEvents = await Event.find(filter)
      .populate("organizer", "firstName lastName email")
      .sort({ date: 1 });

    // Remove today's events whose start time has already passed
    upcomingEvents = upcomingEvents.filter((event) => {
      const eventDate = new Date(event.date);

      const eventDay = new Date(
        eventDate.getFullYear(),
        eventDate.getMonth(),
        eventDate.getDate()
      );

      // Future dates are valid
      if (eventDay > todayStart) {
        return true;
      }

      // Past dates are invalid
      if (eventDay < todayStart) {
        return false;
      }

      // Today's events: check event time
      if (!event.time) {
        return true;
      }

      const timeMatch = event.time.match(
        /^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?/i
      );

      // Keep event if time format cannot be recognized
      if (!timeMatch) {
        return true;
      }

      let hours = Number(timeMatch[1]);
      const minutes = Number(timeMatch[2]);
      const period = timeMatch[3]?.toUpperCase();

      // Convert 12-hour time to 24-hour time
      if (period === "PM" && hours !== 12) {
        hours += 12;
      } else if (period === "AM" && hours === 12) {
        hours = 0;
      }

      const eventTime = new Date(eventDay);
      eventTime.setHours(hours, minutes, 0, 0);

      return eventTime > now;
    });

    // Calculate total events after all filters
    const totalEvents = upcomingEvents.length;

    // Apply pagination
    const events = upcomingEvents.slice(skip, skip + pageLimit);

    const totalPages = Math.ceil(totalEvents / pageLimit);

    return res.status(200).json({
      status: true,
      message: "Events fetched successfully.",
      data: events,
      pagination: {
        totalEvents,
        currentPage,
        totalPages,
        limit: pageLimit,
      },
    });

  } catch (error) {
    console.error("GET ALL EVENTS ERROR:", error);

    return res.status(500).json({
      status: false,
      message: "Failed to fetch events.",
    });
  }
};


const getEventFilterOptions = async (req, res) => {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const filter = {
      isActive: true,
      date: { $gte: todayStart },
    };

    // Get unique categories and locations from MongoDB
    const [categories, locations] = await Promise.all([
      Event.distinct("category", filter),
      Event.distinct("location", filter),
    ]);

    res.status(200).json({
      success: true,
      data: {
        categories: categories.filter(Boolean).sort(),
        locations: locations.filter(Boolean).sort(),
      },
    });
  } catch (error) {
    console.error("Filter options error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch filter options",
    });
  }
};


//get one event byid

const getEventById = async (req,res)=>{
    try{
        const errors = validationResult(req);

        if (!errors.isEmpty()) {
        return res.status(422).json({
            message: errors.array()[0].msg,
        });
        }

        const{id}=req.params;

        const event =await Event.findById(id)
        .populate("organizer","firstName lastName email")

        if(!event){
            return res.status(404).json({
                message:"event not  found"
            });
        }
        return res.status(200).json({
            message:"event fetched successfully",
            data:event,
        });
    }catch(error){
        return res.status(500).json({
            message:"Failed to fetch event"
        })
    }
}


//update event 
const updateEvent = async (req, res) => {
  try {

    const errors = validationResult(req);

    if (!errors.isEmpty()) {
    return res.status(422).json({
        message: errors.array()[0].msg,
    });
    }

    const { id } = req.params;

    const {
      eventName,
      category,
      date,
      time,
      venue,
      location,
      description,
      ticketPrice,
      availableSeats,
    } = req.body;

    // Get logged-in user information
    const {
      user_id: organizerId,
      role: tokenRole,
    } = req.user;

    // Check organizer
    if (tokenRole !== "organizer") {
      return res.status(403).json({
        message: "You are not an organizer",
      });
    }

    const update = {
      eventName,
      category,
      date,
      time,
      venue,
      location,
      description,
      ticketPrice,
      availableSeats,
    };

    // Find users who booked this event
    const bookings = await Booking.find({
      event: id,
      status: { $ne: "cancelled" },
    }).select("user");

    const updatedEvent = await Event.findOneAndUpdate(
      {
        _id: id,
        organizer: organizerId,
      },
      update,
      { new: true }
    );

    // Event not found
    if (!updatedEvent) {
      return res.status(404).json({
        message: "Event not found",
      });
    }

    
      // Send in-app notifications to users who booked this event
      const notifiedUsers = [
        ...new Set(bookings.map((booking) => booking.user.toString())),
      ];

      for (const userId of notifiedUsers) {
        try {
          await Notification.create({
            user: userId,
            type: "event_update",
            message: `The event "${updatedEvent.eventName}" has been updated. Please check the latest event details.`,
          });
        } catch (notificationError) {
          console.error("EVENT UPDATE NOTIFICATION ERROR:", notificationError);
        }
      }



    // Success
    return res.status(200).json({
      status: true,
      message: "Event updated successfully",
      data: updatedEvent,
    });

  } catch (error) {
    return res.status(500).json({
      message: error.message || "Something went wrong",
    });
  }
};

//delete event
const deleteEvent= async(req,res)=>{
    try{
        const errors = validationResult(req);

        if (!errors.isEmpty()) {
        return res.status(422).json({
            message: errors.array()[0].msg,
        });
        }

        const {id}=req.params;
        // Get logged-in user
    const {
      user_id: organizerId,
      role: tokenRole,
    } = req.user;

    // Check organizer
    if (tokenRole !== "organizer") {
      return res.status(403).json({
        message: "You are not an organizer",
      });
    }

    const deletedEvent= await Event.findOneAndDelete({
        _id :id,
        organizer :organizerId
    });

    if (!deletedEvent) {
      return res.status(404).json({
        message: "Event not found",
      });
    }

    return res.status(200).json({
      status: true,
      message: "Event deleted successfully",
      data: deletedEvent,
    });
    }catch(error){
            console.error("DELETE EVENT ERROR:", error);

    return res.status(500).json({
      message: error.message || "Something went wrong",
    });
    }
}

// Get events created by the logged-in organizer
const getMyEvents = async (req, res) => {
  try {
    //authendication middleware get the logged in organizer id from the jwt tocket 
    const organizerId = req.user.user_id;

    //find events  match organizer id 
    const events = await Event.find({
      organizer: organizerId,
    })
      .populate("organizer", "firstName lastName email")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      status: true,
      message: "My events fetched successfully",
      data: events,
      totalEvents: events.length,
    });
  } catch (error) {
    console.error("GET MY EVENTS ERROR:", error);

    return res.status(500).json({
      status: false,
      message: error.message || "Failed to fetch your events",
    });
  }
};


module.exports = {
  createEvent,
  getAllEvents,
  getEventFilterOptions,
  getEventById,
  updateEvent,
  deleteEvent,
  getMyEvents
}