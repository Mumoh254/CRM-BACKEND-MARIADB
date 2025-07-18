const express = require('express');
const router = express.Router();
const checkAdmin    =  require('../middlewares/isAdmin')
const  verifyAndRefreshToken   =  require('../middlewares/authmiddleware')

const { getAllUsers , deleteUser } = require('../conttrollers/adminData/adminUserCtrl');

// GET /api/users
router.get('/allusers',  verifyAndRefreshToken ,  getAllUsers);


router.delete('/delete/:id', verifyAndRefreshToken     ,  deleteUser);

module.exports = router;


const getUserSessionInfo = require('../conttrollers/adminData/loggedinTime');
router.get('/user-session-info'  ,   verifyAndRefreshToken  , getUserSessionInfo);


module.exports = router;
