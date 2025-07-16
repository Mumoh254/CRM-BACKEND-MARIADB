const db = require('../../Configurations/mariaDbConfig');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { DateTime } = require('luxon');
const userCache = require('../../utilities/userCache');

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
  if (!email) return res.status(400).json({ error: 'Missing email' });

  try {
    const [sessions] = await db.query('SELECT id, login_time FROM user_sessions WHERE user_email = ? AND logout_time IS NULL ORDER BY login_time DESC LIMIT 1', [email]);
    if (!sessions.length) return res.status(404).json({ error: 'No active session' });

    const session = sessions[0];
    const logoutTime = DateTime.now().toSQL({ includeOffset: false });
    const duration = Math.round((new Date(logoutTime) - new Date(session.login_time)) / 60000);

    await db.query('UPDATE user_sessions SET logout_time = ?, duration_minutes = ? WHERE id = ?', [logoutTime, duration, session.id]);

    res.clearCookie('accessToken');
    res.clearCookie('refreshToken');
    userCache.del(`refreshToken:${email}`);

    res.json({ success: true, message: 'Logged out', duration: `${duration} minutes` });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Logout failed' });
  }
};

// Reset Password
const resetPassword = async (req, res) => {
  const { email, newPassword } = req.body;

  if (!email || !newPassword) return res.status(400).json({ error: 'Missing fields' });

  try {
    const hashed = await bcrypt.hash(newPassword, 10);
    const [result] = await db.query('UPDATE users SET password = ? WHERE email = ?', [hashed, email]);
    if (!result.affectedRows) return res.status(404).json({ error: 'User not found' });

    userCache.del(email);
    userCache.del(`refreshToken:${email}`);

    res.json({ success: true, message: 'Password reset successful' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Password reset failed' });
  }
};

module.exports = {
  register,
  login,
  logout,
  resetPassword,
  userCache
};
