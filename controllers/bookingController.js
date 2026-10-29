const Booking = require("../models/booking");
const Event = require("../models/event");
const { validationResult } = require("express-validator");
const Notification = require("../models/notification");
const QRCode = require("qrcode");
const crypto = require("crypto");

const createBooking = async (req, res) => {
  try {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
      return res.status(422).json({
        status: false,
        message: errors.array()[0].msg,
      });
    }

    const { event, ticketType, quantity } = req.body;

    // 1. Validate required fields
    if (
      !event ||
      !ticketType ||
      quantity === undefined ||
      quantity === null ||
      quantity === ""
    ) {
      return res.status(400).json({
        status: false,
        message: "Event, ticket type and quantity are required",
      });
    }

    const ticketQuantity = Number(quantity);

    if (!Number.isInteger(ticketQuantity) || ticketQuantity <= 0) {
      return res.status(400).json({
        status: false,
        message: "Quantity must be a positive integer",
      });
    }

    // 2. Find the active event
    const eventData = await Event.findOne({
      _id: event,
      isActive: true,
    });

    if (!eventData) {
      return res.status(404).json({
        status: false,
        message: "Event not found or is no longer available",
      });
    }

    // 3. Prevent booking past events
    const eventDateTime = new Date(
      `${new Date(eventData.date).toISOString().split("T")[0]}T${eventData.time}`
    );

    if (Number.isNaN(eventDateTime.getTime())) {
      return res.status(400).json({
        status: false,
        message: "Invalid event date or time",
      });
    }

    if (eventDateTime < new Date()) {
      return res.status(400).json({
        status: false,
        message: "Cannot book tickets for a past event",
      });
    }

    // 4. Calculate the total price using the database price
    const totalPrice = eventData.ticketPrice * ticketQuantity;

    // 5. Reserve seats atomically to prevent overbooking
    const updatedEvent = await Event.findOneAndUpdate(
      {
        _id: event,
        isActive: true,
        availableSeats: { $gte: ticketQuantity },
      },
      {
        $inc: { availableSeats: -ticketQuantity },
      },
      {
        new: true,
      }
    );

    if (!updatedEvent) {
      return res.status(400).json({
        status: false,
        message: "Event is unavailable or not enough seats are available",
      });
    }

    // Track the booking so we can clean it up if a later step fails.
    let createdBooking = null;

    try {
      // 6. Generate a unique booking ID and secure ticket token
      const bookingId = "BK" + Date.now();
      const ticketToken = crypto.randomBytes(32).toString("hex");

      // 7. Generate the QR code before saving the booking
      const frontendUrl =
        process.env.FRONTEND_URL || "http://localhost:3000";

      const verificationUrl =
        `${frontendUrl}/organizer/verify-ticket?token=${ticketToken}`;

      const qrCode = await QRCode.toDataURL(verificationUrl);

      // 8. Save the booking
      createdBooking = await Booking.create({
        bookingId,
        ticketToken,
        checkedIn: false,
        checkedInAt: null,
        user: req.user.user_id,
        event,
        ticketType,
        quantity: ticketQuantity,
        totalPrice,
      });

      // 9. Send booking confirmation notification
      try {
        await Notification.create({
          user: req.user.user_id,
          type: "booking_confirmation",
          message: `Your booking for ${eventData.eventName} has been confirmed. Booking ID: ${createdBooking.bookingId}`,
        });
      } catch (notificationError) {
        // A notification failure should not cancel a successful booking.
        console.error(
          "BOOKING NOTIFICATION ERROR:",
          notificationError
        );
      }

      // 10. Return booking details and QR code
      return res.status(201).json({
        status: true,
        message: "Booking created successfully",
        data: {
          ...createdBooking.toObject(),
          qrCode,
        },
      });
    } catch (bookingError) {
      // 11. Remove the booking if it was saved before an error occurred
      if (createdBooking) {
        await Booking.deleteOne({
          _id: createdBooking._id,
        });
      }

      // Restore the seats reserved for this booking
      await Event.findByIdAndUpdate(event, {
        $inc: { availableSeats: ticketQuantity },
      });

      throw bookingError;
    }
  } catch (error) {
    console.error("CREATE BOOKING ERROR:", error);

    return res.status(500).json({
      status: false,
      message: error.message || "Booking failed",
    });
  }
};



//getMYbookings
const getMybookings = async (req, res) => {
  try {
    const bookings = await Booking.find({
      user: req.user.user_id,
      status: { $ne: "cancelled" },
    })
      .populate(
        "event",
        "eventName date time venue location ticketPrice image"
      )
      .populate("user", "firstName lastName email");

    const frontendUrl =
      process.env.FRONTEND_URL || "http://localhost:3000";

    const bookingsWithQR = await Promise.all(
      bookings.map(async (booking) => {
        const bookingData = booking.toObject();

        // Generate a QR code if the booking has a ticket token.
        if (booking.ticketToken) {
          const verificationUrl =
            `${frontendUrl}/organizer/verify-ticket?token=${booking.ticketToken}`;

          bookingData.qrCode = await QRCode.toDataURL(
            verificationUrl
          );
        } else {
          bookingData.qrCode = null;
        }

        return bookingData;
      })
    );

    return res.status(200).json({
      status: true,
      message: "Bookings fetched successfully",
      data: bookingsWithQR,
    });
  } catch (error) {
    console.error("GET MY BOOKINGS ERROR:", error);

    return res.status(500).json({
      status: false,
      message: error.message || "Failed to fetch bookings",
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

      // Return seats to the event when booking is cancelled
      await Event.findByIdAndUpdate(
        booking.event,
        {
          $inc: { availableSeats: booking.quantity },
        },
        {
          runValidators: true,
        }
      );

      //change bookig status
      booking.status="cancelled";

      await booking.save();

      // Create booking cancellation notification
      try {
        await Notification.create({
          user: req.user.user_id,
          type: "booking_cancellation",
          message: `Your booking for ${event.eventName} has been cancelled successfully. Booking ID: ${booking.bookingId}`,
        });
      } catch (notificationError) {
        console.error("BOOKING CANCELLATION NOTIFICATION ERROR:", notificationError);
      }

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
      user: req.user.user_id,
    })
      .populate(
        "event",
        "eventName date time venue location ticketPrice image"
      )
      .populate("user", "firstName lastName email");

    if (!booking) {
      return res.status(404).json({
        status: false,
        message: "Booking not found",
      });
    }

    // Generate QR code for the ticket
    let qrCode = null;

    if (booking.ticketToken) {
      const frontendUrl =
        process.env.FRONTEND_URL || "http://localhost:3000";

      const verificationUrl =
        `${frontendUrl}/organizer/verify-ticket?token=${booking.ticketToken}`;

      qrCode = await QRCode.toDataURL(verificationUrl);
    }

    // Convert booking document to a plain object
    const bookingData = booking.toObject();

    // Add QR code to the response
    bookingData.qrCode = qrCode;

    return res.status(200).json({
      status: true,
      message: "Booking fetched successfully",
      data: bookingData,
    });
  } catch (error) {
    console.error("GET BOOKING BY ID ERROR:", error);

    return res.status(500).json({
      status: false,
      message: error.message || "Failed to fetch booking",
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


const verifyTicket = async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        status: false,
        message: "Ticket token is required",
      });
    }

    // Find the booking using the secure ticket token
    const booking = await Booking.findOne({ ticketToken: token })
      .populate("event", "eventName date time venue organizer")
      .populate("user", "firstName lastName email");

    if (!booking) {
      return res.status(404).json({
        status: false,
        message: "Invalid ticket",
      });
    }

    if (booking.status !== "confirmed") {
      return res.status(400).json({
        status: false,
        message: "This booking is cancelled or invalid",
      });
    }

    if (!booking.event) {
      return res.status(404).json({
        status: false,
        message: "Event not found",
      });
    }

    // Ensure this organizer owns the event
    if (
      booking.event.organizer.toString() !== req.user.user_id.toString()
    ) {
      return res.status(403).json({
        status: false,
        message: "You are not authorized to verify this ticket",
      });
    }

    // Prevent the same ticket from being used twice
    if (booking.checkedIn) {
      return res.status(400).json({
        status: false,
        message: "Ticket has already been used",
        data: {
          bookingId: booking.bookingId,
          checkedInAt: booking.checkedInAt,
        },
      });
    }

    booking.checkedIn = true;
    booking.checkedInAt = new Date();

    await booking.save();

    return res.status(200).json({
      status: true,
      message: "Ticket verified successfully",
      data: {
        bookingId: booking.bookingId,
        customerName: booking.user
          ? `${booking.user.firstName || ""} ${
              booking.user.lastName || ""
            }`.trim()
          : "Unknown customer",
        eventName: booking.event.eventName,
        quantity: booking.quantity,
        checkedIn: booking.checkedIn,
        checkedInAt: booking.checkedInAt,
      },
    });
  } catch (error) {
    console.error("VERIFY TICKET ERROR:", error);

    return res.status(500).json({
      status: false,
      message: "Failed to verify ticket",
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
  getOrganizerBookingById,
  verifyTicket,
};





