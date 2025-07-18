const express = require('express');
const router = express.Router();
const   verifyAndRefreshToken    =   require('../middlewares/authmiddleware')

const   {
  verifyToken,
  register,
  getAllUsers,
  login,
  logout,
 resetUserPassword }  =  require('../conttrollers/auth/authController')

router.post('/register', register);
router.post('/login', login);
router.post('/logout', logout);

router.put('/reset-password/:id', verifyAndRefreshToken  , resetUserPassword)




module.exports = router;
