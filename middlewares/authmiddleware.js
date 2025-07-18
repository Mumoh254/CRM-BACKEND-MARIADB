const jwt = require('jsonwebtoken');

const SECRET_KEY = 'InventorySecrests';
const ACCESS_TOKEN_EXPIRES_IN = '15m';

const verifyAndRefreshToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  const accessTokenFromHeader = authHeader && authHeader.startsWith('Bearer ')
    ? authHeader.split(' ')[1]
    : null;

  const accessToken = req.cookies.accessToken || accessTokenFromHeader;
  const refreshToken = req.cookies.refreshToken;

  console.log('--- TOKEN DEBUG START ---');
  console.log('Headers:', req.headers);
  console.log('Cookies:', req.cookies);
  console.log('Access Token:', accessToken);
  console.log('Refresh Token:', refreshToken);
  console.log('--- TOKEN DEBUG END ---');

  if (!refreshToken && !accessTokenFromHeader) {
    console.warn('[Auth] No access or refresh token provided');
    return res.status(401).json({ error: 'No refresh token or access token provided' });
  }

  try {
    const decoded = jwt.verify(accessToken, SECRET_KEY);
    req.userId = decoded.id;
    req.userEmail = decoded.email;
    req.userRole = decoded.role;
    console.log('[Auth] Access token valid. User authenticated:', decoded.email);
    return next();
  } catch (err) {
    console.warn('[Auth] Access token verification failed:', err.name, err.message);

    if (err.name !== 'TokenExpiredError') {
      return res.status(403).json({ error: 'Invalid access token' });
    }

    if (!refreshToken) {
      console.warn('[Auth] Access token expired and no refresh token present');
      return res.status(403).json({ error: 'Access token expired and no refresh token available' });
    }

    try {
      const decodedRefresh = jwt.verify(refreshToken, SECRET_KEY);
      console.log('[Auth] Refresh token valid. Issuing new access token for:', decodedRefresh.email);

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
      console.error('[Auth] Refresh token verification failed:', refreshErr.name, refreshErr.message);
      return res.status(403).json({ error: 'Refresh token expired or invalid' });
    }
  }
};


module.exports = verifyAndRefreshToken;
