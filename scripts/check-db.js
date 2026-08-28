try {
  const db = require('better-sqlite3')('apps/server/data/workforge.db');
  console.log('Tables:', db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all());
  
  const messages = db.prepare("SELECT * FROM messages WHERE session_id = ?").all('session-1787538302219-qx44dm');
  console.log('Messages for session:', messages);
  
  const sessions = db.prepare("SELECT * FROM sessions WHERE id = ?").all('session-1787538302219-qx44dm');
  console.log('Session:', sessions);
} catch(e) {
  console.error('Error:', e.message);
}
