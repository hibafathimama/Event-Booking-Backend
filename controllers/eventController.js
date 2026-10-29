const Event =require("../models/event")
const { validationResult } = require("express-validator");
const Booking = require("../models/booking");
const Notification = require("../models/notification");

//create event
  const createEvent= async (req,res)=>{
    try{
        //validation
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
      } = req.body;

        const image = req.file ? `/uploads/${req.file.filename}` : null;

        if (
      !eventName ||
      !category ||
      !date ||
      !time ||
      !venue ||
      !location ||
      !description ||
      ticketPrice === undefined ||
      totalSeats === undefined
    ) {
      return res.status(400).json({
        message: "All fields are required",
      });
    }
    const event = await Event.create({
      eventName,
      category,
      date,
      time,
      venue,
      location,
      description,
      ticketPrice: Number(ticketPrice),
      totalSeats: Number(totalSeats),
      availableSeats: Number(totalSeats),
      image,
      organizer: req.user.user_id,
    });
    return res.status(201).json({
        message:"Event created successfully",
        data:event
    });

    }catch (error) {
  console.log("Create Event Error:", error);

  return res.status(500).json({
    message: error.message,
  });
}
};

//get all event
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
      limit = 10,
    } = req.query;

    // Show only active events to users.
    const filter = { isActive: true };

    // Search by event name.
    if (search) {
      filter.eventName = { $regex: search, $options: "i" };
    }

    // Filter by category.
    if (category) {
      filter.category = { $regex: category, $options: "i" };
    }

    // Filter by location.
    if (location) {
      filter.location = { $regex: location, $options: "i" };
    }

    // Filter by date.
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

      filter.date = {
        $gte: startDate,
        $lte: endDate,
      };
    }

    // Filter by ticket price.
    if (minPrice !== undefined || maxPrice !== undefined) {
      filter.ticketPrice = {};

      if (minPrice !== undefined && minPrice !== "") {
        filter.ticketPrice.$gte = Number(minPrice);
      }

      if (maxPrice !== undefined && maxPrice !== "") {
        filter.ticketPrice.$lte = Number(maxPrice);
      }
    }

    const currentPage = Math.max(1, Number(page) || 1);
    const pageLimit = Math.max(1, Number(limit) || 10);
    const skip = (currentPage - 1) * pageLimit;

    const [events, totalEvents] = await Promise.all([
      Event.find(filter)
        .populate("organizer", "firstName lastName email")
        .skip(skip)
        .limit(pageLimit)
        .sort({ date: 1 }),

      Event.countDocuments(filter),
    ]);

    return res.status(200).json({
      status: true,
      message: "Events fetched successfully.",
      data: events,
      pagination: {
        totalEvents,
        currentPage,
        totalPages: Math.ceil(totalEvents / pageLimit),
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
  getEventById,
  updateEvent,
  deleteEvent,
  getMyEvents
}