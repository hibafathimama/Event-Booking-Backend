const User = require("../models/user")
const Event = require("../models/event");
const Booking = require("../models/booking");


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

//dashboarad stats
const getDashboardStats = async (req, res) => {
  try {
    const totalUsers = await User.countDocuments({
      role: "user",
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
      },
    });

  } catch (error) {
    console.error("DASHBOARD STATS ERROR:", error);

    return res.status(500).json({
      message: "Failed to fetch dashboard statistics",
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
 getDashboardStats


}