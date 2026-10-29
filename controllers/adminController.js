const User = require("../models/user")
const Event = require("../models/event");
const Booking = require("../models/booking");
const Report = require("../models/report");
const Notification = require("../models/notification");



const getAllUsers = async(req,res)=>{
    try{
        const users =await User.find().select("-password");

        return res.status(200).json({
            status:"true",
            message:"Users fetched successfully",
            data:users
        });
    }catch(error){
        return res.status(500).json({
      message: error.message || "Failed to fetch users"
    });

    }
};

//getoneuser

const getOneUser =async(req,res)=>{
    try{
        const{id}=req.params;

        const user=await User.findById(id).select("-password");

        if (!user){
            return res.status(404).json({
                message:"user not found"
            });
        }
         return res.status(200).json({
            status:true,
            message:"User fetched successfully",
            data:user
         });
    }catch(error){
        return res.status(500).json({
            message:error.message ||"failed to fetch user"
        });
    }
};

const deleteUser =async(req,res)=>{
    try{
        const{id}=req.params;
        const user =await User.findById(id);

        if(!user){
            return res.status(404).json({
                message:"user not found"
            });
        }

        //prevent admin from deleting admin account 
        if(user.role ==="admin"){
         return res.status(403).json({
        message: "Admin account cannot be deleted"
              });        
        }

        //delete
        await User.findByIdAndDelete(id)

      return res.status(200).json({
      status: true,
      message: "User deleted successfully"
    });
    }catch(error){
      return res.status(500).json({
      message: error.message || "Failed to delete user"
    });
    }
};

//get all events 

const getAllEvents = async(req,res)=>{
    try{
        
        const{name,category,location}=req.query;
        const filter ={};

        if(name){
            filter.eventName ={$regex :name,$options: "i"};
        }
        if(category){
            filter.category= {$regex :category,$options:"i"}
        }
        if(location){
            filter.location= {$regex :location,$options :"i"}
        }

        const events= await Event.find(filter)
        .populate("organizer" ,"firstName lastName email");

        return res.status(200).json({
            status:true,
            message:"events fetched successfully",
            data:events
        });

        }catch (error) {
        console.error("GET ALL EVENTS ERROR:", error);

        return res.status(500).json({
        message: error.message || "Failed to fetch events"
        });
  }

}

//get event by id

const getEventByid= async(req,res)=>{
    try{
        const{id}=req.params;
        const event = await Event.findById(id)
        .populate("organizer","firstName lastName email");

        if(!event){
            return res.status(404).json({
                message:"Event not found"
            });
        }
        return res.status(200).json({
            status:true,
            message:"Event fetched successfully",
            data:event
        });
    }catch(error){
        return res.status(500).json({
            message:error.message ||"failed to fetch event"
        })
    }
}

//delete event 
const deleteEvent = async(req,res)=>{
    try{
        const {id}= req.params;
        const event=await Event.findById(id);

        if(!event){
            return res.status(404).json({
                message:"event is not found"
            });
        }

        await Event.findByIdAndDelete(id);

        return res.status(200).json({
            status:true,
            message:"event deleted successfully"
        })
    }catch(error){
        return res.status(500).json({
            message:error.message || "failed to delete event"
        })
    }
}

// Activate or deactivate an event and notify its organizer
const toggleEventStatus = async (req, res) => {
  try {
    const { id } = req.params;

    const event = await Event.findById(id);

    if (!event) {
      return res.status(404).json({
        status: false,
        message: "Event not found",
      });
    }

    // Change the event status
    event.isActive = event.isActive === false ? true : false;

    await event.save();

    // Notify the organizer
    if (event.organizer) {
      try {
        await Notification.create({
          message: event.isActive
            ? `Your event "${event.eventName}" has been activated by the admin.`
            : `Your event "${event.eventName}" has been deactivated by the admin.`,
          type: "event_update",
          organizer: event.organizer,
        });
      } catch (notificationError) {
        // Do not fail the event status update if notification creation fails
        console.error("CREATE EVENT NOTIFICATION ERROR:", notificationError);
      }
    }

    return res.status(200).json({
      status: true,
      message: event.isActive
        ? "Event activated successfully"
        : "Event deactivated successfully",
      data: event,
    });
  } catch (error) {
    console.error("TOGGLE EVENT STATUS ERROR:", error);

    return res.status(500).json({
      status: false,
      message: error.message || "Failed to change event status",
    });
  }
};


//update event
const updateEvent = async (req, res) => {
  try {
    const { id } = req.params;

    // Find the existing event
    const event = await Event.findById(id);

    if (!event) {
      return res.status(404).json({
        status: false,
        message: "Event not found",
      });
    }

    const allowedFields = [
      "eventName",
      "category",
      "date",
      "time",
      "venue",
      "location",
      "description",
      "ticketPrice",
      "totalSeats",
      "availableSeats",
    ];

    // Copy only the permitted fields
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        event[field] = req.body[field];
      }
    }

    // Validate ticket price
    const price = Number(event.ticketPrice);

    if (!Number.isFinite(price) || price < 0) {
      return res.status(400).json({
        status: false,
        message: "Ticket price must be a valid non-negative number",
      });
    }

    event.ticketPrice = price;

    // Validate total seats
    const totalSeats = Number(event.totalSeats);

    if (!Number.isInteger(totalSeats) || totalSeats < 1) {
      return res.status(400).json({
        status: false,
        message: "Total seats must be a positive integer",
      });
    }

    // Validate available seats
    const availableSeats = Number(event.availableSeats);

    if (
      !Number.isInteger(availableSeats) ||
      availableSeats < 0
    ) {
      return res.status(400).json({
        status: false,
        message: "Available seats must be a non-negative integer",
      });
    }

    if (availableSeats > totalSeats) {
      return res.status(400).json({
        status: false,
        message: "Available seats cannot exceed total seats",
      });
    }

    event.totalSeats = totalSeats;
    event.availableSeats = availableSeats;

    // Save the existing event
    const updatedEvent = await event.save();

        // Notify the organizer that the event was edited
        if (updatedEvent.organizer) {
        try {
            await Notification.create({
            message: `The admin updated your event "${updatedEvent.eventName}".`,
            type: "event_update",
            organizer: updatedEvent.organizer,
            });
        } catch (notificationError) {
            console.error("CREATE EVENT NOTIFICATION ERROR:", notificationError);
        }
        }


    return res.status(200).json({
      status: true,
      message: "Event updated successfully",
      data: updatedEvent,
    });
  } catch (error) {
    console.error("UPDATE EVENT ERROR:", error);

    return res.status(500).json({
      status: false,
      message: error.message || "Failed to update event",
    });
  }
};




//dashboarad stats
const getDashboardStats = async (req, res) => {
  try {
    const totalUsers = await User.countDocuments({
      role: "user",
    });

    const pendingReports = await Report.countDocuments({
    status: "pending",
    });

    const totalOrganizers = await User.countDocuments({
      role: "organizer",
    });

    const totalEvents = await Event.countDocuments();

    const totalBookings = await Booking.countDocuments();

    return res.status(200).json({
      status: true,
      message: "Dashboard statistics fetched successfully",
      data: {
        totalUsers,
        totalOrganizers,
        totalEvents,
        totalBookings,
        pendingReports
      },
    });

  } catch (error) {
    console.error("DASHBOARD STATS ERROR:", error);

    return res.status(500).json({
      message: "Failed to fetch dashboard statistics",
    });
  }
};


// Get all bookings for admin
const getAllBookings = async (req, res) => {
try {
const bookings = await Booking.find()
.populate("user", "firstName lastName email")
.populate("event", "eventName date time venue location ticketPrice")
.sort({ createdAt: -1 });

return res.status(200).json({
  status: true,
  message: "Bookings fetched successfully",
  data: bookings,
});

} catch (error) {
console.error("GET ALL BOOKINGS ERROR:", error);

return res.status(500).json({
  status: false,
  message: error.message || "Failed to fetch bookings",
});

}
};

// Cancel a booking by admin
const cancelBooking = async (req, res) => {
  try {
    const { id } = req.params;

    // Find the booking
    const booking = await Booking.findById(id);

    if (!booking) {
      return res.status(404).json({
        status: false,
        message: "Booking not found",
      });
    }

    // Check if already cancelled
    if (booking.status === "cancelled") {
      return res.status(400).json({
        status: false,
        message: "Booking is already cancelled",
      });
    }

    // Restore available seats if the event still exists
    const event = await Event.findById(booking.event);

    if (event) {
      event.availableSeats += booking.quantity;
      await event.save();
    }

    // Update booking status
    booking.status = "cancelled";
    await booking.save();

    return res.status(200).json({
      status: true,
      message: "Booking cancelled successfully",
      data: booking,
    });
  } catch (error) {
    console.error("CANCEL BOOKING ERROR:", error);

    return res.status(500).json({
      status: false,
      message: error.message || "Failed to cancel booking",
    });
  }
};


module.exports={
 getAllUsers,
 getOneUser,
 deleteUser,
 getAllEvents,
 getEventByid,
 deleteEvent,
 toggleEventStatus,
 updateEvent,
 getDashboardStats,
 getAllBookings,
 cancelBooking


}