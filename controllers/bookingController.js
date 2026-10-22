const Booking = require("../models/booking");
const Event = require("../models/event")
const { validationResult } = require("express-validator");

const createBooking = async (req, res) => {
  try {
    // 1. Validate request using express-validator
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
      return res.status(422).json({
        message: errors.array()[0].msg
      });
    }

    // 2. Get data from request body
    const { event, ticketType, quantity } = req.body;

    // 3. Check required fields
    if (
      !event ||
      !ticketType ||
      quantity === undefined ||
      quantity === null ||
      quantity === ""
    ) {
      return res.status(400).json({
        message: "Event, ticket type and quantity are required"
      });
    }

    // 4. Validate quantity
    const ticketQuantity = Number(quantity);

    if (
      !Number.isInteger(ticketQuantity) ||
      ticketQuantity <= 0
    ) {
      return res.status(400).json({
        message: "Quantity must be a positive integer"
      });
    }

    // 5. Find event in MongoDB
    const eventData = await Event.findById(event);

    if (!eventData) {
      return res.status(404).json({
        message: "Event not found"
      });
    }

    // 6. Check whether the event has passed
    const eventDateTime = new Date(
      `${new Date(eventData.date).toISOString().split("T")[0]}T${eventData.time}`
    );

    if (eventDateTime < new Date()) {
      return res.status(400).json({
        message: "Cannot book tickets for a past event"
      });
    }

    // 7. Calculate total price using the database price
    const totalPrice = eventData.ticketPrice * ticketQuantity;

    // 8. Atomically reserve seats.
    // MongoDB decreases seats only if enough are still available.
    const updatedEvent = await Event.findOneAndUpdate(
      {
        _id: event,
        availableSeats: { $gte: ticketQuantity }
      },
      {
        $inc: { availableSeats: -ticketQuantity }
      },
      {
        new: true
      }
    );

    if (!updatedEvent) {
      return res.status(400).json({
        message: "Not enough seats available"
      });
    }

    try {
      // 9. Create booking after reserving seats
      const bookingId = "BK" + Date.now();

      const booking = await Booking.create({
        bookingId,
        user: req.user.user_id,
        event,
        ticketType,
        quantity: ticketQuantity,
        totalPrice
      });

      // 10. Return success response
      return res.status(201).json({
        status: true,
        message: "Booking created successfully",
        data: booking
      });

    } catch (bookingError) {
      // Restore seats if booking creation fails
      await Event.findByIdAndUpdate(event, {
        $inc: { availableSeats: ticketQuantity }
      });

      throw bookingError;
    }

  } catch (error) {
    console.error("CREATE BOOKING ERROR:", error);

    return res.status(500).json({
      message: error.message || "Booking failed"
    });
  }
};

//getMYbookings
const getMybookings = async (req, res) => {
  try {
    const bookings = await Booking.find({
    user: req.user.user_id,
    status: { $ne: "cancelled" }
  })
  .populate(
    "event",
    "eventName date time venue location ticketPrice image"
  )
  .populate("user", "firstName lastName email");

    return res.status(200).json({
      status: true,
      message: "Bookings fetched successfully",
      data: bookings
    });

  } catch (error) {
    return res.status(500).json({
      message: error.message || "Failed to fetch bookings"
    });
  }
};



//getAllbookings
const getAllbookings = async(req,res)=>{
  try{
    const bookings = await Booking.find()
    .populate("user", "firstName lastName email")
    .populate("event","eventName date time venue location ticketPrice");

    return res.status(200).json({
      status:true,
      message:"All booking Fetched successfully",
      data:bookings
    });
  }catch(error){
        console.error("GET ALL BOOKINGS ERROR:", error);

    return res.status(500).json({
      message: error.message || "Failed to fetch bookings"
    });

  }
};

//organizershow their bookings
const getOrganizerBookings = async (req, res) => {
  try {
    // Find all events created by this organizer
    const events = await Event.find({
      organizer: req.user.user_id
    });

    // Get the event IDs
    const eventIds = events.map((event) => event._id);

    // Find bookings for those events
    const bookings = await Booking.find({
      event: { $in: eventIds }
    })
      .populate("user", "firstName lastName email")
      .populate(
        "event",
        "eventName date time venue location ticketPrice"
      );

    return res.status(200).json({
      status: true,
      message: "Organizer bookings fetched successfully",
      data: bookings
    });

  } catch (error) {
    console.error("GET ORGANIZER BOOKINGS ERROR:", error);

    return res.status(500).json({
      message: error.message || "Failed to fetch organizer bookings"
    });
  }
};

 //cancel booking
const cancelBooking = async(req,res)=>{
  try{

          //validation
      const errors = validationResult(req);

    if (!errors.isEmpty()) {
      return res.status(422).json({
        message: errors.array()[0].msg
      });
      }
      
    const {id}=req.params;

    //find the booking
    const booking = await Booking.findOne({
      _id:id,
      user:req.user.user_id
    });
        if (!booking) {
      return res.status(404).json({
        message: "Booking not found"
      });
    }
        // Check if already cancelled
    if (booking.status === "cancelled") {
      return res.status(400).json({
        message: "Booking is already cancelled"
      });
    }
      //find the event 
      const event =await Event.findById(booking.event);
      if(!event){
        return res.status(404).json({
          message:"event not found"
        });
      }

      //return to seats 
      event.availableSeats=event.availableSeats+booking.quantity;

      await event.save();

      //change bookig status
      booking.status="cancelled";

      await booking.save();

      return res.status(200).json({
        status:true,
        message:"Booking cancelled successfully",
        data:booking
      });

}catch(error){
     return res.status(500).json({
      message: error.message || "Failed to cancel booking"
    });

}
}

// Get one booking by ID for viewing a ticket
const getBookingById = async (req, res) => {
  try {
    const { id } = req.params;

    // Find the booking belonging to the logged-in user
    const booking = await Booking.findOne({
      _id: id,
      user: req.user.user_id
    })
      .populate(
        "event",
        "eventName date time venue location ticketPrice image"
      )
      .populate("user", "firstName lastName email");

    if (!booking) {
      return res.status(404).json({
        status: false,
        message: "Booking not found"
      });
    }

    return res.status(200).json({
      status: true,
      message: "Booking fetched successfully",
      data: booking
    });

  } catch (error) {
    console.error("GET BOOKING BY ID ERROR:", error);

    return res.status(500).json({
      status: false,
      message: error.message || "Failed to fetch booking"
    });
  }
};



// Get booking details for an organizer
const getOrganizerBookingById = async (req, res) => {
  try {
    const { id } = req.params;

    // Find the booking and populate event and customer details
    const booking = await Booking.findById(id)
      .populate(
        "event",
        "eventName date time venue location ticketPrice image organizer"
      )
      .populate("user", "firstName lastName email");

    // Check whether the booking exists
    if (!booking) {
      return res.status(404).json({
        status: false,
        message: "Booking not found",
      });
    }

    // Check whether the event exists
    if (!booking.event) {
      return res.status(404).json({
        status: false,
        message: "Event not found",
      });
    }

    // Allow access only if this organizer created the event
    if (
      booking.event.organizer.toString() !==
      req.user.user_id.toString()
    ) {
      return res.status(403).json({
        status: false,
        message: "You are not authorized to view this booking",
      });
    }

    return res.status(200).json({
      status: true,
      message: "Booking details fetched successfully",
      data: booking,
    });
  } catch (error) {
    console.error("GET ORGANIZER BOOKING DETAILS ERROR:", error);

    return res.status(500).json({
      status: false,
      message: error.message || "Failed to fetch booking details",
    });
  }
};


module.exports = {
  createBooking,
  getMybookings,
  getAllbookings,
  cancelBooking,
  getOrganizerBookings,
  getBookingById,
  getOrganizerBookingById
};

