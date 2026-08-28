try {
  const db = require('better-sqlite3')('apps/server/data/workforge.db');
  console.log('Messages schema:', db.prepare("PRAGMA table_info(messages)").all());
  console.log('Sessions schema:', db.prepare("PRAGMA table_info(sessions)").all());
} catch(e) {
  console.error('Error:', e.message);
}
