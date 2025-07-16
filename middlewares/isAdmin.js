const jwt = require('jsonwebtoken');

const SECRET_KEY = 'InventorySecrests'; // or process.env.JWT_SECRET

function checkAdmin(req, res, next) {
  try {
    const token = req.cookies.accessToken;
    if (!token) {
      return res.status(401).json({ error: 'No access token' });
    }

    const decoded = jwt.verify(token, SECRET_KEY);

    if (decoded.role && decoded.role.toLowerCase() === 'admin') {
      req.user = decoded;
      return next();
    } else {
      return res.status(403).json({ error: 'Access denied: Admins only' });
    }
  } catch (err) {
    console.error('Admin check token error:', err.message);
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = checkAdmin;
