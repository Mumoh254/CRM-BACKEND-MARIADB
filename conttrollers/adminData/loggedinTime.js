const expressAsyncHandler = require('express-async-handler');
const { DateTime, Duration } = require('luxon');
const db = require('../../Configurations/mariaDbConfig');

// Helper to determine if a session spans across the "current" moment
// or if it has a definitive logout_time.
// This is crucial for determining if a user is 'active' or 'logged out' for a given day.
const mergeSessions = (sessions) => {
    if (!sessions.length) return [];

    // Sort by login time to ensure correct merging
    sessions.sort((a, b) => new Date(a.login_time) - new Date(b.login_time));

    const merged = [];
    let currentMergedSession = {
        login_time: new Date(sessions[0].login_time),
        logout_time: sessions[0].logout_time ? new Date(sessions[0].logout_time) : null,
        is_active: sessions[0].logout_time === null // Is this specific session currently active?
    };

    for (let i = 1; i < sessions.length; i++) {
        const sessionStart = new Date(sessions[i].login_time);
        const sessionEnd = sessions[i].logout_time ? new Date(sessions[i].logout_time) : null;
        const sessionIsActive = sessions[i].logout_time === null;

        // If the new session starts before or at the end of the current merged block, merge them
        // Consider currentMergedSession.logout_time as Date.now() if it's null (still active)
        const currentEndForComparison = currentMergedSession.logout_time || Date.now();

        if (sessionStart <= currentEndForComparison) {
            // Merge: extend the end time if the new session goes longer
            currentMergedSession.logout_time = (currentMergedSession.logout_time === null || sessionIsActive)
                ? null // If either is active, the merged session is active
                : new Date(Math.max(currentEndForComparison, sessionEnd)); // Otherwise, take the max end time
            currentMergedSession.is_active = currentMergedSession.is_active || sessionIsActive;
        } else {
            // No overlap, push the current merged session and start a new one
            merged.push({ ...currentMergedSession });
            currentMergedSession = {
                login_time: sessionStart,
                logout_time: sessionEnd,
                is_active: sessionIsActive
            };
        }
    }
    merged.push({ ...currentMergedSession }); // Add the last merged session

    return merged;
};


const getUserSessionInfo = expressAsyncHandler(async (req, res) => {
    try {
        const now = DateTime.now().setZone('Africa/Nairobi'); // Use Luxon for robust date handling
        const fiveDaysAgo = now.minus({ days: 5 }).startOf('day'); // Start of 5 days ago for accurate cutoff

        // 1. **Auto-Delete Old Data (Older than 5 days)**
        // Only delete sessions whose login_time is strictly older than 5 days ago
        // and whose logout_time is also before 5 days ago, or if logout_time is null,
        // it implies a very old, unclosed session which should probably be cleaned up.
        // For simplicity, let's target sessions that started more than 5 days ago.
        const deleteQuery = `
            DELETE FROM user_sessions
            WHERE login_time < ?
        `;
        // We'll also consider deleting genuinely old, unclosed sessions, but for safety,
        // let's stick to login_time for now.
        await db.query(deleteQuery, [fiveDaysAgo.toSQL()]);
        console.log(`[Backend] Deleted sessions older than: ${fiveDaysAgo.toISODate()}`);


        // 2. **Fetch Data for the Last 5 Days**
        // Fetch all sessions within the last 5 days
        const [rows] = await db.query(
            `
            SELECT id, user_email, login_time, logout_time
            FROM user_sessions
            WHERE login_time >= ?
            ORDER BY user_email, login_time
            `,
            [fiveDaysAgo.toSQL()]
        );

        const groupedByUserAndDay = {};

        rows.forEach(session => {
            // Get the date part of the login_time to group by day
            const loginDate = DateTime.fromJSDate(new Date(session.login_time)).toISODate();
            const key = `${session.user_email}_${loginDate}`;
            if (!groupedByUserAndDay[key]) {
                groupedByUserAndDay[key] = [];
            }
            groupedByUserAndDay[key].push(session);
        });

        const results = [];

        for (const key in groupedByUserAndDay) {
            const [user_email, dateString] = key.split('_');
            const sessionsForDay = groupedByUserAndDay[key];

            const mergedBlocks = mergeSessions(sessionsForDay);

            let totalMsForDay = 0;
            let isActiveForDay = false; // Flag to check if user was 'active' on this specific day

            mergedBlocks.forEach(block => {
                const blockStart = DateTime.fromJSDate(block.login_time);
                const blockEnd = block.logout_time ? DateTime.fromJSDate(block.logout_time) : now; // If logout_time is null, use current time
                
                // Only count duration that falls within the current day (dateString)
                const dayStart = DateTime.fromISO(dateString).startOf('day');
                const dayEnd = DateTime.fromISO(dateString).endOf('day');

                const effectiveStart = DateTime.max(blockStart, dayStart);
                const effectiveEnd = DateTime.min(blockEnd, dayEnd);
                
                // If the block effectively overlaps with the current day, calculate duration
                if (effectiveEnd > effectiveStart) {
                    totalMsForDay += effectiveEnd.diff(effectiveStart).toMillis();
                }

                // A user is 'active' for the day if any of their sessions for that day
                // are still ongoing (logout_time is null) or if the last merged session
                // ended after the start of that day.
                if (block.is_active || (block.logout_time && DateTime.fromJSDate(block.logout_time) >= dayStart)) {
                     isActiveForDay = true;
                }
            });
            
            // Refine isActiveForDay: A user is "active" *for the current day* if they have an open session,
            // or if their last session closed *on* that day.
            // For past days, if the logout_time is not null for all sessions, they are 'logged out'.
            // For the current day (today), if any session has logout_time NULL, they are 'active'.
            let finalStatus;
            if (dateString === now.toISODate()) { // If it's today's data
                // Check if any session is truly open right now
                const anyOpenSession = sessionsForDay.some(s => s.logout_time === null);
                finalStatus = anyOpenSession ? 'Active' : 'Logged Out';
            } else { // For historical days
                // If all sessions on this day had a logout time, they were logged out for the day
                const allSessionsClosed = sessionsForDay.every(s => s.logout_time !== null);
                finalStatus = allSessionsClosed ? 'Logged Out' : 'Active'; // If not all closed, implying an open session *on that day*
            }


            results.push({
                user_email,
                date: dateString,
                totalMs: totalMsForDay,
                status: finalStatus // Add the status
            });
        }

        // Sort results by date descending, then by user email
        results.sort((a, b) => {
            const dateComparison = new Date(b.date) - new Date(a.date);
            if (dateComparison !== 0) return dateComparison;
            return a.user_email.localeCompare(b.user_email);
        });

        res.json({ date: now.toISODate(), sessions: results });

    } catch (err) {
        console.error("Error in getUserSessionInfo:", err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = getUserSessionInfo;