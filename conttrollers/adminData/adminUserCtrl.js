
const expressAsyncHandler = require('express-async-handler');
const db = require('../../Configurations/mariaDbConfig');
const bcrypt = require('bcryptjs'); 

// Get all users
const getAllUsers = expressAsyncHandler(async (req, res) => {
  try {
    const [users] = await db.query('SELECT id, email, role, created_at, updated_at FROM users ORDER BY created_at DESC');
    res.json({ success: true, users });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Delete user


const deleteUser = expressAsyncHandler(async (req, res) => {
  const userId = req.params.id; // User ID 
  try {
    
    const [userCheck] = await db.query('SELECT role, email FROM users WHERE id = ?', [userId]);
    if (userCheck.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    if (userCheck[0].role === 'admin') {
      return res.status(403).json({ error: 'Cannot delete admin user' });
    }

    // Get user email before deletion for session cleanup
    const userEmail = userCheck[0].email;

    // Delete user from the 'users' table
    const [result] = await db.query('DELETE FROM users WHERE id = ?', [userId]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'User not found or already deleted' });
    }

    // Optionally, delete user sessions associated with this user's email
    await db.query('DELETE FROM user_sessions WHERE user_email = ?', [userEmail]);

    res.json({ success: true, message: 'User deleted successfully' });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});




module.exports = { getAllUsers, deleteUser};