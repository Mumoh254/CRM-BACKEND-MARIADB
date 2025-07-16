const express = require('express');
const router = express.Router();

const   {
  verifyToken,
  register,
  getAllUsers,
  login,
  logout,
  resetPassword,
  protectedRoute
}  =  require('../conttrollers/auth/authController')

router.post('/register', register);
// router.get('/allusers', getAllUsers);
router.post('/login', login);
router.post('/logout',logout);
// router.post('/reset-password', resetPassword);


module.exports = router;
