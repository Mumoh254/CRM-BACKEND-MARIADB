const jwt = require('jsonwebtoken');
const userCache = require('../utilities/userCache');

const SECRET_KEY = 'InventorySecrests';
const ACCESS_TOKEN_EXPIRES_IN = '15m';

const verifyAndRefreshToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  const accessTokenFromHeader = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;

  const accessToken = req.cookies.accessToken || accessTokenFromHeader;
  const refreshToken = req.cookies.refreshToken;

  if (!refreshToken && !accessTokenFromHeader) {
    return res.status(401).json({ error: 'No refresh token or access token provided' });
  }

  try {
    const decoded = jwt.verify(accessToken, SECRET_KEY);
    req.userId = decoded.id;
    req.userEmail = decoded.email;
    req.userRole = decoded.role;
    return next();
  } catch (err) {
    if (err.name !== 'TokenExpiredError') {
      return res.status(403).json({ error: 'Invalid access token' });
    }

    // If access token expired, try refreshing (only if refresh token available)
    if (!refreshToken) return res.status(403).json({ error: 'Access token expired and no refresh token available' });

    try {
      const decodedRefresh = jwt.verify(refreshToken, SECRET_KEY);
      const cachedToken = userCache.get(`refreshToken:${decodedRefresh.email}`);
      if (cachedToken !== refreshToken) {
        return res.status(403).json({ error: 'Invalid refresh token' });
      }

      const newAccessToken = jwt.sign(
        { id: decodedRefresh.id, email: decodedRefresh.email },
        SECRET_KEY,
        { expiresIn: ACCESS_TOKEN_EXPIRES_IN }
      );

      res.cookie('accessToken', newAccessToken, {
        httpOnly: true,
        maxAge: 15 * 60 * 1000,
        sameSite: 'Strict',
        secure: process.env.NODE_ENV === 'production'
      });

      req.userId = decodedRefresh.id;
      req.userEmail = decodedRefresh.email;
      return next();
    } catch (refreshErr) {
      return res.status(403).json({ error: 'Refresh token expired or invalid' });
    }
  }
};

module.exports = verifyAndRefreshToken;
