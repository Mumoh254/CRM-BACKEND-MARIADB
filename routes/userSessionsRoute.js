const express = require('express');
const router = express.Router();
const checkAdmin    =  require('../middlewares/isAdmin')


const getUserSessionInfo = require('../conttrollers/adminData/loggedinTime');
router.get('/user-session-info',   checkAdmin    , getUserSessionInfo);

module.exports = router;
