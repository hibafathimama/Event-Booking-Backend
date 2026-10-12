const Event =require("../models/event")
const { validationResult } = require("express-validator");

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

        const{
        eventName,
        category,
        date,
        time,
        venue,
        location,
        description,
        ticketPrice,
        availableSeats,
        }=req.body;

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
      availableSeats === undefined
    ) {
      return res.status(400).json({
        message: "All fields are required",
      });
    }
    const event= await Event.create({
        eventName,
        category,
        date,
        time,
        venue,
        location,
        description,
        ticketPrice,
        availableSeats,
        image, // Added image path
        organizer: req.user.user_id,
    })
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
const { name, category, location, date, minPrice, maxPrice } = req.query;

    const filter = {};

    // Search by event name
    if (name) {
        filter.eventName = { $regex: name, $options: "i" };
    }

    // Search by category
    if (category) {
        filter.category = { $regex: category, $options: "i" };
    }

    // Search by location
    if (location) {
        filter.location = { $regex: location, $options: "i" };
    }

    // Filter by date
    if (date) {
        const selectedDate = new Date(date);

        if (isNaN(selectedDate.getTime())) {
            return res.status(400).json({
                message: "Invalid date format. Use YYYY-MM-DD",
            });
        }

        const nextDate = new Date(selectedDate);
        nextDate.setDate(nextDate.getDate() + 1);

        filter.date = {
            $gte: selectedDate,
            $lt: nextDate,
        };
    }

    // Filter by minimum price
    if (minPrice !== undefined && minPrice !== "") {
        const minimum = Number(minPrice);

        if (!Number.isFinite(minimum) || minimum < 0) {
            return res.status(400).json({
                message: "Minimum price must be a valid non-negative number",
            });
        }

        filter.ticketPrice = { $gte: minimum };
    }

    // Filter by maximum price
    if (maxPrice !== undefined && maxPrice !== "") {
        const maximum = Number(maxPrice);

        if (!Number.isFinite(maximum) || maximum < 0) {
            return res.status(400).json({
                message: "Maximum price must be a valid non-negative number",
            });
        }

        filter.ticketPrice = {
            ...filter.ticketPrice,
            $lte: maximum,
        };
    }

    // Check that minimum price is not greater than maximum price
    if (
        filter.ticketPrice?.$gte !== undefined &&
        filter.ticketPrice?.$lte !== undefined &&
        filter.ticketPrice.$gte > filter.ticketPrice.$lte
    ) {
        return res.status(400).json({
            message: "Minimum price cannot be greater than maximum price",
        });
    }

    const events = await Event.find(filter)
        .populate("organizer", "firstName lastName email");

    return res.status(200).json({
        status: true,
        message: "Events fetched successfully",
        data: events,
    });

} catch (error) {
    console.error("GET ALL EVENTS ERROR:", error);

    return res.status(500).json({
        message: error.message || "Failed to fetch events",
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
module.exports = {
  createEvent,
  getAllEvents,
  getEventById,
  updateEvent,
  deleteEvent
}