const expressAsyncHandler = require('express-async-handler');
const { DateTime } = require('luxon');
const db = require('../../Configurations/mariaDbConfig'); 

const mergeSessions = (sessions) => {
  if (!sessions.length) return [];

  // Sort sessions by start time
  sessions.sort((a, b) => new Date(a.login_time) - new Date(b.login_time));

  const merged = [];
  let current = { 
    start_time: new Date(sessions[0].login_time), 
    end_time: new Date(sessions[0].logout_time) 
  };

  for (let i = 1; i < sessions.length; i++) {
    const sessionStart = new Date(sessions[i].login_time);
    const sessionEnd = new Date(sessions[i].logout_time);

    // If sessions overlap or are adjacent (no gap between them)
    if (sessionStart <= current.end_time) {
      // Extend the current session end time if needed
      if (sessionEnd > current.end_time) {
        current.end_time = sessionEnd;
      }
    } else {
      // No overlap, push current and start a new one
      merged.push({
        start_time: current.start_time.toISOString(),
        end_time: current.end_time.toISOString()
      });
      current = { start_time: sessionStart, end_time: sessionEnd };
    }
  }

  // Push the last session
  merged.push({
    start_time: current.start_time.toISOString(),
    end_time: current.end_time.toISOString()
  });

  return merged;
};

const getUserSessionInfo = expressAsyncHandler(async (req, res) => {
  try {
    // Fetch all sessions for the last 7 days
    const [rows] = await db.query(`
      SELECT 
        user_email,
        login_time,
        logout_time
      FROM user_sessions
      WHERE login_time >= DATE_SUB(NOW(), INTERVAL 7 DAY)
      ORDER BY user_email, login_time
    `);

    // Group sessions by user_email and date (yyyy-MM-dd)
    const grouped = rows.reduce((acc, session) => {
      const dateKey = session.login_time.toISOString
        ? session.login_time.toISOString().slice(0, 10)
        : new Date(session.login_time).toISOString().slice(0, 10);

      const key = `${session.user_email}_${dateKey}`;
      if (!acc[key]) acc[key] = [];
      acc[key].push(session);
      return acc;
    }, {});

    // Merge sessions for each user per day
    const mergedSessions = [];

    for (const key in grouped) {
      const [user_email, date] = key.split('_');
      const merged = mergeSessions(grouped[key]);

      merged.forEach(session => {
        mergedSessions.push({
          user_email,
          date,
          start_time: session.start_time,
          end_time: session.end_time,
        });
      });
    }

    res.json({ date: DateTime.now().toISODate(), users: mergedSessions });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = getUserSessionInfo;
