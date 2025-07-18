const rateLimit = require("express-rate-limit");

// ✅ Login limiter
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  handler: (req, res) => {
    return res.status(429).json({
      message: "Too many login attempts from this IP, please try again after 15 minutes"
    });
  }
});

// ✅ Password reset limiter
const resetPasswordLimitter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3,
  handler: (req, res) => {
    return res.status(429).json({
      message: "Too many password reset attempts from this IP, please try again after 15 minutes"
    });
  }
});

// ✅ User deletion limiter
const deleteUserLimitter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3,
  handler: (req, res) => {
    return res.status(429).json({
      message: "Too many user deletion attempts from this IP, please try again after 15 minutes"
    });
  }
});

// ✅ OTP request limiter (missing before)
const requestOTPLimitter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 5,
  handler: (req, res) => {
    return res.status(429).json({
      message: "Too many OTP requests. Please try again later."
    });
  }
});

// ✅ Export all
module.exports = {
  loginLimiter,
  resetPasswordLimitter,
  deleteUserLimitter,
  requestOTPLimitter 
};
