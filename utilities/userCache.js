const NodeCache = require('node-cache');
const userCache = new NodeCache({ stdTTL: 0, checkperiod: 600 }); 


const originalSet = userCache.set;
userCache.set = function (...args) {
  console.log("Cache SET:", args[0]);
  return originalSet.apply(this, args);
};

const originalGet = userCache.get;
userCache.get = function (...args) {
  const result = originalGet.apply(this, args);
  console.log("Cache GET:", args[0], "=>", result);
  return result;
};

module.exports = userCache;
