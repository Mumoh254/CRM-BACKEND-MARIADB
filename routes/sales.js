// routes/salesRoutes.js
const express = require('express');
const router = express.Router();
const salesController = require('../conttrollers/salesCtrl/salesControl'); 
const verifyAndRefreshToken = require('../middlewares/authmiddleware'); 
const  checkAdmin   =  require('../middlewares/isAdmin')

// POST /api/sales/ - Create a new sale
router.post('/',      verifyAndRefreshToken   , salesController.createSale);

router.post('/stkpush',   verifyAndRefreshToken   ,  salesController.initiateStkPush);

router.get('/analytics' ,   verifyAndRefreshToken   , salesController.getAnalytics);

router.patch('/stock/:id',   verifyAndRefreshToken   , salesController.updateStock);

router.get('/sales'  ,   verifyAndRefreshToken    , salesController.getSales);

// router.get('/discounts'    ,  salesController.getDiscounts);

router.post('/discounts/notify', salesController.notifyDiscounts);

module.exports = router;