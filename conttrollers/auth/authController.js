const db = require('../../Configurations/mariaDbConfig');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { DateTime } = require('luxon');
const userCache = require('../../utilities/userCache');
const expressAsyncHandler = require('express-async-handler');

const SECRET_KEY = 'InventorySecrests';
const ACCESS_TOKEN_EXPIRES_IN = '15m';
const REFRESH_TOKEN_EXPIRES_IN = '7d';

// Register
const register = async (req, res) => {
  const { email, password, role } = req.body;

  if (!email || !password) return res.status(400).json({ error: 'Missing required fields' });

  try {
    const [existing] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length > 0) return res.status(409).json({ error: 'User already exists' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const userRole = ['admin', 'user'].includes(role) ? role : 'user';

    const [result] = await db.query('INSERT INTO users (email, password, role) VALUES (?, ?, ?)', [email, hashedPassword, userRole]);

    const userData = { id: result.insertId, email, role: userRole };
    userCache.set(email, userData);

    const token = jwt.sign(userData, SECRET_KEY, { expiresIn: '1d' });

    res.status(201).json({ success: true, userId: result.insertId, role: userRole, token });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Registration failed' });
  }
};

// Login

const login = async (req, res) => {
  const email = req.body.email?.toLowerCase();
  const password = req.body.password;

  if (!email || !password) return res.status(400).json({ error: 'Missing email or password' });

  try {
    const [users] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
    if (!users.length) return res.status(401).json({ error: 'Invalid credentials' });

    const user = users[0];
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const accessToken = jwt.sign({ id: user.id, email: user.email, role: user.role }, SECRET_KEY, { expiresIn: ACCESS_TOKEN_EXPIRES_IN });
    const refreshToken = jwt.sign({ id: user.id, email: user.email }, SECRET_KEY, { expiresIn: REFRESH_TOKEN_EXPIRES_IN });

    await db.query('INSERT INTO user_sessions (user_email, login_time) VALUES (?, ?)', [user.email, DateTime.now().toSQL({ includeOffset: false })]);

    userCache.set(`refreshToken:${email}`, refreshToken);
    userCache.set(email, { id: user.id, email: user.email, role: user.role });
res.cookie('refreshToken', refreshToken, {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'Strict',
  maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
});
 res.cookie('accessToken', accessToken, { httpOnly: true, maxAge: 15 * 60 * 1000 });
   

  res.json({
    success: true,
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
    },
    accessToken, // Send access token in response body
  });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Login failed' });
  }
};

// Logout
const logout = async (req, res) => {
  const email = req.body.email?.toLowerCase();
  if (!email) {
    return res.status(400).json({ error: 'Missing email' });
  }

  try {
    // Get the most recent active session
    const [sessions] = await db.query(
      'SELECT id, login_time FROM user_sessions WHERE user_email = ? AND logout_time IS NULL ORDER BY login_time DESC LIMIT 1',
      [email]
    );

    if (!sessions.length) {
      return res.status(404).json({ error: 'No active session' });
    }

    const session = sessions[0];

    const logoutTime = DateTime.now().toSQL({ includeOffset: false });
    const loginTime = new Date(session.login_time);
    const logoutTimeJS = new Date(logoutTime);

    const durationMinutes = Math.round((logoutTimeJS - loginTime) / 60000);

    // Update session with logout info
    await db.query(
      'UPDATE user_sessions SET logout_time = ?, duration_minutes = ? WHERE id = ?',
      [logoutTime, durationMinutes, session.id]
    );

    // Clear cookies and cached token
    res.clearCookie('accessToken');
    res.clearCookie('refreshToken');
    userCache.del(`refreshToken:${email}`);

    return res.json({
      success: true,
      message: 'Logged out successfully',
      duration: `${durationMinutes} minute(s)`
    });

  } catch (error) {
    console.error('Logout error:', error);
    return res.status(500).json({ error: 'Logout failed due to server error' });
  }
};



const resetUserPassword = expressAsyncHandler(async (req, res) => {
  const userId = req.params.id;
  const { newPassword } = req.body;

  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters long' });
  }

  try {
    // Check if user exists
    const [user] = await db.query('SELECT id FROM users WHERE id = ?', [userId]);
    if (user.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Hash the new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    // Update password in DB
    const [result] = await db.query(
      'UPDATE users SET password = ?, updated_at = NOW() WHERE id = ?',
      [hashedPassword, userId]
    );

    res.json({ success: true, message: 'Password reset successful' });
  } catch (error) {
    console.error('Error resetting password:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});




module.exports = {
  register,
  login,
  logout,
  resetUserPassword,
 
  userCache
};
