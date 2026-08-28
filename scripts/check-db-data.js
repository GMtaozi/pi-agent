try {
  const db = require('better-sqlite3')('apps/server/data/workforge.db');
  const messages = db.prepare("SELECT * FROM messages WHERE sessionId = ?").all('session-1787538302219-qx44dm');
  console.log('Messages for session:', JSON.stringify(messages, null, 2));
  
  const sessions = db.prepare("SELECT * FROM sessions WHERE id = ?").all('session-1787538302219-qx44dm');
  console.log('Session:', JSON.stringify(sessions, null, 2));
} catch(e) {
  console.error('Error:', e.message);
}
