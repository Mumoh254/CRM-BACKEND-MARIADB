const NodeCache = require('node-cache');
const userCache = new NodeCache({ stdTTL: 0, checkperiod: 600 }); 

module.exports = userCache;
