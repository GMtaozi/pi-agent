import type { Migration } from '../database-types.js';

/**
 * M1 P1-2 — 通知告警深化：新增 notification_silence 静默窗口表
 *
 * 存储每个用户的“免打扰”截止时间，checkAlertRules 触发前先校验是否处于静默期。
 * SQLite 与 PostgreSQL 双版本。
 */
export const v29Sqlite: Migration = {
  version: 29,
  name: 'm1-notification-silence',
  up: async (db: any) => {
    await db.query('notification_silence', `
      CREATE TABLE IF NOT EXISTS notification_silence (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        until TEXT NOT NULL,
        reason TEXT,
        created_at TEXT NOT NULL
      )
    `);
    await db.query('notification_silence', 'CREATE INDEX IF NOT EXISTS idx_notif_silence_user ON notification_silence(user_id)');
  },
  down: async (db: any) => {
    await db.query('notification_silence', 'DROP TABLE IF EXISTS notification_silence');
  },
};

export const v29Postgres: Migration = {
  version: 29,
  name: 'm1-notification-silence',
  up: async (db: any) => {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS notification_silence (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        until TIMESTAMPTZ NOT NULL,
        reason TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_notif_silence_user ON notification_silence(user_id);
    `);
  },
  down: async (db: any) => {
    await db.execute('DROP TABLE IF EXISTS notification_silence CASCADE');
  },
};
