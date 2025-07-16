const rateLimit = require("express-rate-limit");


// limit   logins

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 100, 
  handler: function (req, res) {
    return res.status(429).json({
      message: "Too many login attempts from this IP, please try again after 15 minutes"
    });
  }
});


// limit  password  resets 
const resetPasswordLimitter = rateLimit({
    windowMs: 15 * 60 * 1000, 
    max: 3, 
    handler: function (req, res) {
      return res.status(429).json({
        message: "Too many passwordReset attempts from this IP, please try again after 15 minutes"
      });
    }
  });
  
  
//   limit user   deletions

  const  deleteUserLimitter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 3,
    handler: function (req, res) {
      return res.status(429).json({
        message: "Too many OTP request attempts from this IP, please try again after 15 minutes"
      });
    }
  });

//     export  modules    for  usage 
module.exports = {
    loginLimiter,
    requestOTPLimitter,
    resetPasswordLimitter,
    deleteUserLimitter,
  
}
