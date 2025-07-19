// routes/mpesa.js
const express = require('express');
const router = express.Router();
//const mpesaController = require('..mpesa'); // Assuming you have a dedicated M-Pesa controller
const mpesaController = require('../conttrollers/mpesaController'); 
// This should be the route your frontend *actually calls*
// If your frontend calls /api/stkpush:
router.post('/stkpush', mpesaController.initiateStkPush);

// If your frontend calls /api/mpesa/stk-push (more likely given your index.js route):
// router.post('/stk-push', mpesaController.initiateStkPush);


// Add the callback URL here as well
router.post('/stk-callback', mpesaController.stkCallback); // Assuming you have a stkCallback function

module.exports = router;