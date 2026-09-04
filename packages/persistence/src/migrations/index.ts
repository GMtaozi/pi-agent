import type { Migration } from '../database-types.js';
import type { SqliteDatabase } from '../database.js';
import { v27Sqlite } from './v27.js';
import { v28Sqlite } from './v28.js';
import { v29Sqlite } from './v29.js';
import { v30Sqlite } from './v30.js';
import { v31Sqlite } from './v31.js';
import { v32Sqlite } from './v32.js';
import { v33Sqlite } from './v33.js';
import { v34Sqlite } from './v34.js';
import { v35Sqlite } from './v35.js';
import { v36Sqlite } from './v36.js';
import { v37Sqlite } from './v37.js';
import { v38Sqlite } from './v38.js';
import { v39Sqlite } from './v39.js';
import { v40Sqlite } from './v40.js';
import { v41Sqlite } from './v41.js';
import { v42Sqlite } from './v42.js';
import { v43Sqlite } from './v43.js';
import { v44Sqlite } from './v44.js';
import { v45Sqlite } from './v45.js';
import { v46Sqlite } from './v46.js';
import { v47Sqlite } from './v47.js';
import { v48Sqlite } from './v48.js';
import { v49Sqlite } from './v49.js';
import { v50Sqlite } from './v50.js';
import { v51Sqlite } from './v51.js';
import { v52Sqlite } from './v52.js';
import { v53Sqlite } from './v53.js';
import { v54Sqlite } from './v54.js';
import { v55Sqlite } from './v55.js';
import { v56Sqlite } from './v56.js';
import { v57Sqlite } from './v57.js';
import { v58Sqlite } from './v58.js';
import { v59Sqlite } from './v59.js';
import { v60Sqlite } from './v60.js';
import { v61Sqlite } from './v61.js';
import { v62Sqlite } from './v62.js';
type Database = SqliteDatabase;

export const migrations: Migration[] = [
  {
    version: 1,
    name: 'initial-schema',
    up: async (db: Database) => {
      // Sessions table
      await db.query('sessions', 'CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, model TEXT, workspaceId TEXT, status TEXT, createdAt TEXT, updatedAt TEXT, metadata TEXT)');
      
      // Messages table
      await db.query('messages', 'CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY, sessionId TEXT, role TEXT, content TEXT, artifacts TEXT, createdAt TEXT, metadata TEXT)');
      
      // Tasks table
      await db.query('tasks', 'CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, workspaceId TEXT, type TEXT, status TEXT, input TEXT, result TEXT, error TEXT, createdAt TEXT, updatedAt TEXT, completedAt TEXT)');
      
      // Approvals table
      await db.query('approvals', 'CREATE TABLE IF NOT EXISTS approvals (id TEXT PRIMARY KEY, action TEXT, details TEXT, status TEXT, createdAt TEXT, decidedAt TEXT, decidedBy TEXT, reason TEXT)');
      
      // Audit logs table
      await db.query('audit_logs', 'CREATE TABLE IF NOT EXISTS audit_logs (id TEXT PRIMARY KEY, timestamp TEXT, action TEXT, userId TEXT, sessionId TEXT, details TEXT, result TEXT, error TEXT)');
      
      // Workspace files table
      await db.query('workspace_files', 'CREATE TABLE IF NOT EXISTS workspace_files (id TEXT PRIMARY KEY, path TEXT, name TEXT, size INTEGER, type TEXT, workspaceId TEXT, createdAt TEXT, updatedAt TEXT, metadata TEXT)');
      
      // Create indexes
      await db.query('sessions', 'CREATE INDEX IF NOT EXISTS idx_sessions_workspace ON sessions(workspaceId)');
      await db.query('messages', 'CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(sessionId)');
      await db.query('tasks', 'CREATE INDEX IF NOT EXISTS idx_tasks_workspace ON tasks(workspaceId)');
      await db.query('tasks', 'CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)');
      await db.query('audit_logs', 'CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_logs(timestamp)');
      await db.query('audit_logs', 'CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action)');
    },
    down: async (db: Database) => {
      await db.query('sessions', 'DROP TABLE IF EXISTS sessions');
      await db.query('messages', 'DROP TABLE IF EXISTS messages');
      await db.query('tasks', 'DROP TABLE IF EXISTS tasks');
      await db.query('approvals', 'DROP TABLE IF EXISTS approvals');
      await db.query('audit_logs', 'DROP TABLE IF EXISTS audit_logs');
      await db.query('workspace_files', 'DROP TABLE IF EXISTS workspace_files');
    }
  },
  {
    version: 2,
    name: 'add-mode-to-sessions',
    up: async (db: Database) => {
      await db.query('sessions', 'ALTER TABLE sessions ADD COLUMN mode TEXT DEFAULT \'standard\'');
      await db.query('sessions', 'CREATE INDEX IF NOT EXISTS idx_sessions_mode ON sessions(mode)');
    },
    down: async (db: Database) => {
      await db.query('sessions', 'DROP INDEX IF EXISTS idx_sessions_mode');
      await db.query('sessions', 'ALTER TABLE sessions DROP COLUMN mode');
    }
  },
  {
    version: 3,
    name: 'add-presets-table',
    up: async (db: Database) => {
      await db.query('presets', 'CREATE TABLE IF NOT EXISTS presets (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, mode TEXT NOT NULL, tools TEXT NOT NULL, systemPrompt TEXT NOT NULL, context TEXT NOT NULL, builtin INTEGER DEFAULT 0, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL)');
      await db.query('presets', 'CREATE INDEX IF NOT EXISTS idx_presets_mode ON presets(mode)');
    },
    down: async (db: Database) => {
      await db.query('presets', 'DROP TABLE IF EXISTS presets');
    }
  },
  {
    version: 4,
    name: 'add-feedback-tables',
    up: async (db: Database) => {
      await db.query('feedback', 'CREATE TABLE IF NOT EXISTS feedback (id TEXT PRIMARY KEY, sessionId TEXT NOT NULL, messageId TEXT NOT NULL, rating INTEGER NOT NULL, comment TEXT, feedbackType TEXT DEFAULT \'quick\', createdAt TEXT NOT NULL)');
      await db.query('feedback', 'CREATE INDEX IF NOT EXISTS idx_feedback_session ON feedback(sessionId)');
      await db.query('feedback', 'CREATE INDEX IF NOT EXISTS idx_feedback_rating ON feedback(rating)');
      await db.query('feedback', 'CREATE INDEX IF NOT EXISTS idx_feedback_message ON feedback(messageId)');
      
      await db.query('code_feedback', 'CREATE TABLE IF NOT EXISTS code_feedback (id TEXT PRIMARY KEY, sessionId TEXT NOT NULL, messageId TEXT NOT NULL, rating TEXT NOT NULL, context TEXT, createdAt TEXT NOT NULL)');
      await db.query('code_feedback', 'CREATE INDEX IF NOT EXISTS idx_code_feedback_session ON code_feedback(sessionId)');
      await db.query('code_feedback', 'CREATE INDEX IF NOT EXISTS idx_code_feedback_rating ON code_feedback(rating)');
    },
    down: async (db: Database) => {
      await db.query('feedback', 'DROP TABLE IF EXISTS feedback');
      await db.query('code_feedback', 'DROP TABLE IF EXISTS code_feedback');
    }
  },
  {
    version: 5,
    name: 'add-user-preferences',
    up: async (db: Database) => {
      await db.query('user_preferences', 'CREATE TABLE IF NOT EXISTS user_preferences (userId TEXT PRIMARY KEY, preferences TEXT NOT NULL, updatedAt TEXT NOT NULL)');
    },
    down: async (db: Database) => {
      await db.query('user_preferences', 'DROP TABLE IF EXISTS user_preferences');
    }
  },
  {
    version: 6,
    name: 'add-memory-chunks',
    up: async (db: Database) => {
      await db.query('memory_chunks', 'CREATE TABLE IF NOT EXISTS memory_chunks (id TEXT PRIMARY KEY, userId TEXT NOT NULL, sessionId TEXT, type TEXT NOT NULL, content TEXT NOT NULL, summary TEXT, embedding TEXT, metadata TEXT, expiresAt TEXT, createdAt TEXT NOT NULL)');
      await db.query('memory_chunks', 'CREATE INDEX IF NOT EXISTS idx_memory_chunks_user ON memory_chunks(userId)');
      await db.query('memory_chunks', 'CREATE INDEX IF NOT EXISTS idx_memory_chunks_type ON memory_chunks(type)');
      await db.query('memory_chunks', 'CREATE INDEX IF NOT EXISTS idx_memory_chunks_expires ON memory_chunks(expiresAt)');
    },
    down: async (db: Database) => {
      await db.query('memory_chunks', 'DROP TABLE IF EXISTS memory_chunks');
    }
  },
  {
    version: 7,
    name: 'add-feature-flags',
    up: async (db: Database) => {
      await db.query('feature_flags', 'CREATE TABLE IF NOT EXISTS feature_flags (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, enabled INTEGER DEFAULT 0, rolloutPercentage INTEGER DEFAULT 0, targetUsers TEXT, targetTenants TEXT, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL)');
    },
    down: async (db: Database) => {
      await db.query('feature_flags', 'DROP TABLE IF EXISTS feature_flags');
    }
  },
  {
    version: 8,
    name: 'add-evolution-tables',
    up: async (db: Database) => {
      await db.query('prompt_versions', 'CREATE TABLE IF NOT EXISTS prompt_versions (id TEXT PRIMARY KEY, name TEXT NOT NULL, prompt TEXT NOT NULL, version TEXT NOT NULL, isActive INTEGER DEFAULT 0, createdAt TEXT NOT NULL)');
      await db.query('experiments', 'CREATE TABLE IF NOT EXISTS experiments (id TEXT PRIMARY KEY, name TEXT NOT NULL, controlPromptId TEXT NOT NULL, treatmentPromptId TEXT NOT NULL, rolloutPercentage INTEGER DEFAULT 0, metrics TEXT, status TEXT DEFAULT \'draft\', createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL)');
    },
    down: async (db: Database) => {
      await db.query('prompt_versions', 'DROP TABLE IF EXISTS prompt_versions');
      await db.query('experiments', 'DROP TABLE IF EXISTS experiments');
    }
  },
  {
    version: 9,
    name: 'add-settings-table',
    up: async (db: Database) => {
      await db.query('settings', 'CREATE TABLE IF NOT EXISTS settings (id TEXT PRIMARY KEY, key TEXT NOT NULL UNIQUE, value TEXT NOT NULL, updatedAt TEXT NOT NULL)');
    },
    down: async (db: Database) => {
      await db.query('settings', 'DROP TABLE IF EXISTS settings');
    }
  },
  {
    version: 10,
    name: 'add-custom-models-table',
    up: async (db: Database) => {
      await db.query('custom_models', 'CREATE TABLE IF NOT EXISTS custom_models (id TEXT PRIMARY KEY, name TEXT NOT NULL, provider TEXT NOT NULL, endpoint TEXT NOT NULL, apiKey TEXT NOT NULL, modelParams TEXT, enabled INTEGER DEFAULT 1, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL)');
      await db.query('custom_models', 'CREATE INDEX IF NOT EXISTS idx_custom_models_provider ON custom_models(provider)');
    },
    down: async (db: Database) => {
      await db.query('custom_models', 'DROP TABLE IF EXISTS custom_models');
    }
  },
  {
    version: 11,
    name: 'add-tenants',
    up: async (db: Database) => {
      await db.query('tenants', 'CREATE TABLE IF NOT EXISTS tenants (id TEXT PRIMARY KEY, name TEXT NOT NULL, plan TEXT DEFAULT \'free\', quota JSON, settings TEXT, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL)');
      await db.query('tenants', 'CREATE INDEX IF NOT EXISTS idx_tenants_plan ON tenants(plan)');
      
      // Seed default tenant if not exists
      const result = await db.query('tenants', 'SELECT COUNT(*) as count FROM tenants');
      if (result.rows[0]?.count === 0) {
        await db.query('tenants', 'INSERT INTO tenants (id, name, plan, quota, settings, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)', [
          'default',
          'Default Tenant',
          'free',
          JSON.stringify({ dailyTokens: 100000, monthlyTokens: 1000000 }),
          JSON.stringify({}),
          new Date().toISOString(),
          new Date().toISOString()
        ]);
      }
    },
    down: async (db: Database) => {
      await db.query('tenants', 'DROP TABLE IF EXISTS tenants');
    }
  },
  {
    version: 12,
    name: 'add-tenant-id-to-tables',
    up: async (db: Database) => {
      await db.query('sessions', 'ALTER TABLE sessions ADD COLUMN tenantId TEXT DEFAULT \'default\'');
      await db.query('sessions', 'CREATE INDEX IF NOT EXISTS idx_sessions_tenant ON sessions(tenantId)');
      await db.query('messages', 'ALTER TABLE messages ADD COLUMN tenantId TEXT DEFAULT \'default\'');
      await db.query('messages', 'CREATE INDEX IF NOT EXISTS idx_messages_tenant ON messages(tenantId)');
      await db.query('feedback', 'ALTER TABLE feedback ADD COLUMN tenantId TEXT DEFAULT \'default\'');
      await db.query('feedback', 'CREATE INDEX IF NOT EXISTS idx_feedback_tenant ON feedback(tenantId)');
      await db.query('code_feedback', 'ALTER TABLE code_feedback ADD COLUMN tenantId TEXT DEFAULT \'default\'');
      await db.query('code_feedback', 'CREATE INDEX IF NOT EXISTS idx_code_feedback_tenant ON code_feedback(tenantId)');
      await db.query('custom_models', 'ALTER TABLE custom_models ADD COLUMN tenantId TEXT DEFAULT \'default\'');
      await db.query('custom_models', 'CREATE INDEX IF NOT EXISTS idx_custom_models_tenant ON custom_models(tenantId)');
      await db.query('memory_chunks', 'ALTER TABLE memory_chunks ADD COLUMN tenantId TEXT DEFAULT \'default\'');
      await db.query('memory_chunks', 'CREATE INDEX IF NOT EXISTS idx_memory_chunks_tenant ON memory_chunks(tenantId)');
    },
    down: async (db: Database) => {
      await db.query('sessions', 'DROP INDEX IF EXISTS idx_sessions_tenant');
      await db.query('sessions', 'ALTER TABLE sessions DROP COLUMN tenantId');
      await db.query('messages', 'DROP INDEX IF EXISTS idx_messages_tenant');
      await db.query('messages', 'ALTER TABLE messages DROP COLUMN tenantId');
      await db.query('feedback', 'DROP INDEX IF EXISTS idx_feedback_tenant');
      await db.query('feedback', 'ALTER TABLE feedback DROP COLUMN tenantId');
      await db.query('code_feedback', 'DROP INDEX IF EXISTS idx_code_feedback_tenant');
      await db.query('code_feedback', 'ALTER TABLE code_feedback DROP COLUMN tenantId');
      await db.query('custom_models', 'DROP INDEX IF EXISTS idx_custom_models_tenant');
      await db.query('custom_models', 'ALTER TABLE custom_models DROP COLUMN tenantId');
      await db.query('memory_chunks', 'DROP INDEX IF EXISTS idx_memory_chunks_tenant');
      await db.query('memory_chunks', 'ALTER TABLE memory_chunks DROP COLUMN tenantId');
    }
  },
  {
    version: 13,
    name: 'add-market-skills',
    up: async (db: Database) => {
      await db.query('market_skills', 'CREATE TABLE IF NOT EXISTS market_skills (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, version TEXT DEFAULT \'1.0.0\', manifest TEXT NOT NULL, author TEXT, enabled INTEGER DEFAULT 1, downloads INTEGER DEFAULT 0, rating REAL DEFAULT 0, category TEXT, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL)');
      await db.query('market_skills', 'CREATE INDEX IF NOT EXISTS idx_market_skills_category ON market_skills(category)');
      await db.query('market_skills', 'CREATE INDEX IF NOT EXISTS idx_market_skills_enabled ON market_skills(enabled)');
      await db.query('skill_usage', 'CREATE TABLE IF NOT EXISTS skill_usage (id TEXT PRIMARY KEY, skillId TEXT NOT NULL, sessionId TEXT NOT NULL, executedAt TEXT NOT NULL, success INTEGER DEFAULT 1)');
      await db.query('skill_usage', 'CREATE INDEX IF NOT EXISTS idx_skill_usage_skill ON skill_usage(skillId)');
    },
    down: async (db: Database) => {
      await db.query('market_skills', 'DROP TABLE IF EXISTS market_skills');
      await db.query('skill_usage', 'DROP TABLE IF EXISTS skill_usage');
    }
  },
  {
    version: 14,
    name: 'add-skill-rating-count',
    up: async (db: Database) => {
      await db.query('market_skills', 'ALTER TABLE market_skills ADD COLUMN ratingCount INTEGER DEFAULT 0');
    },
    down: async (db: Database) => {
      await db.query('market_skills', 'ALTER TABLE market_skills DROP COLUMN ratingCount');
    }
  },
  {
    version: 15,
    name: 'add-skill-versions',
    up: async (db: Database) => {
      await db.query('skill_versions', 'CREATE TABLE IF NOT EXISTS skill_versions (id TEXT PRIMARY KEY, skillId TEXT NOT NULL, version TEXT NOT NULL, manifest TEXT NOT NULL, changelog TEXT, createdBy TEXT, createdAt TEXT NOT NULL)');
      await db.query('skill_versions', 'CREATE INDEX IF NOT EXISTS idx_skill_versions_skill ON skill_versions(skillId)');
      await db.query('skill_versions', 'CREATE INDEX IF NOT EXISTS idx_skill_versions_created ON skill_versions(createdAt DESC)');
      await db.query('market_skills', 'ALTER TABLE market_skills ADD COLUMN currentVersion TEXT DEFAULT \'1.0.0\'');
    },
    down: async (db: Database) => {
      await db.query('skill_versions', 'DROP TABLE IF EXISTS skill_versions');
      await db.query('market_skills', 'ALTER TABLE market_skills DROP COLUMN currentVersion');
    }
  },
  {
    version: 16,
    name: 'add-skill-usage-duration',
    up: async (db: Database) => {
      await db.query('skill_usage', 'ALTER TABLE skill_usage ADD COLUMN durationMs INTEGER');
    },
    down: async (db: Database) => {
      await db.query('skill_usage', 'ALTER TABLE skill_usage DROP COLUMN durationMs');
    }
  },
  {
    version: 17,
    name: 'add-skill-comments',
    up: async (db: Database) => {
      await db.query('skill_comments', 'CREATE TABLE IF NOT EXISTS skill_comments (id TEXT PRIMARY KEY, skillId TEXT NOT NULL, sessionId TEXT NOT NULL, userName TEXT, content TEXT NOT NULL, rating INTEGER, createdAt TEXT NOT NULL)');
      await db.query('skill_comments', 'CREATE INDEX IF NOT EXISTS idx_skill_comments_skill ON skill_comments(skillId)');
      await db.query('skill_comments', 'CREATE INDEX IF NOT EXISTS idx_skill_comments_created ON skill_comments(createdAt DESC)');
    },
    down: async (db: Database) => {
      await db.query('skill_comments', 'DROP TABLE IF EXISTS skill_comments');
    }
  },
  {
    version: 18,
    name: 'add-hot-path-composite-indexes',
    up: async (db: Database) => {
      // Session message timeline: WHERE sessionId = ? ORDER BY createdAt
      await db.query('messages', 'CREATE INDEX IF NOT EXISTS idx_messages_session_created ON messages(sessionId, createdAt)');
      // Skill usage stats/aggregation: filter by skill within a time range
      await db.query('skill_usage', 'CREATE INDEX IF NOT EXISTS idx_skill_usage_skill_executed ON skill_usage(skillId, executedAt)');
      // Audit log lookups by user
      await db.query('audit_logs', 'CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(userId)');
      // Pending approval listing: WHERE status = ? ORDER BY createdAt
      await db.query('approvals', 'CREATE INDEX IF NOT EXISTS idx_approvals_status_created ON approvals(status, createdAt)');
    },
    down: async (db: Database) => {
      await db.query('messages', 'DROP INDEX IF EXISTS idx_messages_session_created');
      await db.query('skill_usage', 'DROP INDEX IF EXISTS idx_skill_usage_skill_executed');
      await db.query('audit_logs', 'DROP INDEX IF EXISTS idx_audit_logs_user');
      await db.query('approvals', 'DROP INDEX IF EXISTS idx_approvals_status_created');
    }
  },
  {
    version: 19,
    name: 'add-session-foreign-keys',
    up: async (db: Database) => {
      // Rebuild child tables with a real FOREIGN KEY to sessions(id) so orphan
      // rows can no longer be produced. SQLite cannot ALTER a table to add an
      // FK, so we clean orphans, copy data into a new table and swap it in.
      const rebuildWithSessionFk = async (table: string): Promise<void> => {
        // NOTE: must read the schema via a SELECT (pragma_table_info table
        // function). A bare `PRAGMA table_info(...)` goes through exec() in
        // Database.query and returns no rows.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
        const cols = (await db.query(table, `SELECT name, type, "notnull", dflt_value, pk FROM pragma_table_info('${table}')`)).rows as any[];
        if (!cols || cols.length === 0) return;
        const colDefs = cols.map(c => {
          let def = `"${c.name}" ${c.type}`;
          if (c.notnull) def += ' NOT NULL';
          if (c.pk) def += ' PRIMARY KEY';
          if (c.dflt_value !== null && c.dflt_value !== undefined) def += ` DEFAULT ${c.dflt_value}`;
          return def;
        });
        const fkCol = cols.some(c => c.name === 'sessionId') ? 'sessionId' : null;
        if (!fkCol) return;

        // Remove existing orphan rows before enforcing the constraint.
        await db.query(table, `DELETE FROM ${table} WHERE "${fkCol}" IS NOT NULL AND "${fkCol}" NOT IN (SELECT id FROM sessions)`);

        const colList = cols.map(c => `"${c.name}"`).join(', ');
        await db.query(table, `CREATE TABLE ${table}_new (${colDefs.join(', ')}, FOREIGN KEY ("${fkCol}") REFERENCES sessions(id) ON DELETE CASCADE)`);
        await db.query(table, `INSERT INTO ${table}_new (${colList}) SELECT ${colList} FROM ${table}`);
        await db.query(table, `DROP TABLE ${table}`);
        await db.query(table, `ALTER TABLE ${table}_new RENAME TO ${table}`);
      };

      await rebuildWithSessionFk('messages');
      await rebuildWithSessionFk('feedback');
      await rebuildWithSessionFk('code_feedback');

      // DROP TABLE dropped the indexes along with the tables — recreate them.
      await db.query('messages', 'CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(sessionId)');
      await db.query('feedback', 'CREATE INDEX IF NOT EXISTS idx_feedback_session ON feedback(sessionId)');
      await db.query('feedback', 'CREATE INDEX IF NOT EXISTS idx_feedback_rating ON feedback(rating)');
      await db.query('feedback', 'CREATE INDEX IF NOT EXISTS idx_feedback_message ON feedback(messageId)');
      await db.query('code_feedback', 'CREATE INDEX IF NOT EXISTS idx_code_feedback_session ON code_feedback(sessionId)');
      await db.query('code_feedback', 'CREATE INDEX IF NOT EXISTS idx_code_feedback_rating ON code_feedback(rating)');
      await db.query('messages', 'CREATE INDEX IF NOT EXISTS idx_messages_tenant ON messages(tenantId)');
      await db.query('feedback', 'CREATE INDEX IF NOT EXISTS idx_feedback_tenant ON feedback(tenantId)');
      await db.query('code_feedback', 'CREATE INDEX IF NOT EXISTS idx_code_feedback_tenant ON code_feedback(tenantId)');
      await db.query('messages', 'CREATE INDEX IF NOT EXISTS idx_messages_session_created ON messages(sessionId, createdAt)');
    },
    down: async (db: Database) => {
      // Rebuild without the FK constraints.
      const rebuildWithoutFk = async (table: string): Promise<void> => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
        const cols = (await db.query(table, `SELECT name, type, "notnull", dflt_value, pk FROM pragma_table_info('${table}')`)).rows as any[];
        if (!cols || cols.length === 0) return;
        const colDefs = cols.filter(c => !c.pk).map(c => {
          let def = `"${c.name}" ${c.type}`;
          if (c.notnull) def += ' NOT NULL';
          if (c.dflt_value !== null && c.dflt_value !== undefined) def += ` DEFAULT ${c.dflt_value}`;
          return def;
        });
        const pk = cols.find(c => c.pk);
        const colList = cols.map(c => `"${c.name}"`).join(', ');
        await db.query(table, `CREATE TABLE ${table}_old (${colDefs.join(', ')}, ${pk ? `"${pk.name}" TEXT PRIMARY KEY` : ''})`);
        await db.query(table, `INSERT INTO ${table}_old (${colList}) SELECT ${colList} FROM ${table}`);
        await db.query(table, `DROP TABLE ${table}`);
        await db.query(table, `ALTER TABLE ${table}_old RENAME TO ${table}`);
      };
      await rebuildWithoutFk('messages');
      await rebuildWithoutFk('feedback');
      await rebuildWithoutFk('code_feedback');
    }
  },
  {
    version: 20,
    name: 'add-session-title',
    up: async (db: Database) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
      const cols = (await db.query('sessions', `SELECT name FROM pragma_table_info('sessions')`)).rows as any[];
      if (!cols.some((c: any) => c.name === 'title')) {
        await db.query('sessions', `ALTER TABLE sessions ADD COLUMN title TEXT`);
      }
    },
    down: async (_db: Database) => {
      // SQLite 删除列需重建表，成本高且非必要；此处不处理。
    }
  },
  {
    version: 21,
    name: 'add-execution-monitoring',
    up: async (db: Database) => {
      // Execution records: one row per agent run (session turn / orchestration run).
      await db.query('execution_records', `
        CREATE TABLE IF NOT EXISTS execution_records (
          id TEXT PRIMARY KEY,
          session_id TEXT,
          agent_id TEXT,
          user_id TEXT,
          tenant_id TEXT,
          model TEXT NOT NULL,
          provider TEXT,
          status TEXT NOT NULL DEFAULT 'running',
          started_at TEXT NOT NULL,
          completed_at TEXT,
          duration_ms INTEGER DEFAULT 0,
          prompt_tokens INTEGER DEFAULT 0,
          completion_tokens INTEGER DEFAULT 0,
          total_tokens INTEGER DEFAULT 0,
          cost REAL DEFAULT 0,
          error_message TEXT,
          metadata TEXT,
          created_at TEXT NOT NULL
        )
      `);
      await db.query('execution_records', 'CREATE INDEX IF NOT EXISTS idx_exec_records_session ON execution_records(session_id)');
      await db.query('execution_records', 'CREATE INDEX IF NOT EXISTS idx_exec_records_agent ON execution_records(agent_id)');
      await db.query('execution_records', 'CREATE INDEX IF NOT EXISTS idx_exec_records_user ON execution_records(user_id)');
      await db.query('execution_records', 'CREATE INDEX IF NOT EXISTS idx_exec_records_status ON execution_records(status)');
      await db.query('execution_records', 'CREATE INDEX IF NOT EXISTS idx_exec_records_started ON execution_records(started_at DESC)');
      await db.query('execution_records', 'CREATE INDEX IF NOT EXISTS idx_exec_records_model ON execution_records(model)');

      // Token usage events: one row per LLM call inside an execution.
      await db.query('token_usage_events', `
        CREATE TABLE IF NOT EXISTS token_usage_events (
          id TEXT PRIMARY KEY,
          execution_id TEXT,
          session_id TEXT,
          model TEXT NOT NULL,
          provider TEXT,
          prompt_tokens INTEGER DEFAULT 0,
          completion_tokens INTEGER DEFAULT 0,
          total_tokens INTEGER DEFAULT 0,
          cached_tokens INTEGER DEFAULT 0,
          cost REAL DEFAULT 0,
          latency_ms INTEGER DEFAULT 0,
          created_at TEXT NOT NULL
        )
      `);
      await db.query('token_usage_events', 'CREATE INDEX IF NOT EXISTS idx_token_usage_exec ON token_usage_events(execution_id)');
      await db.query('token_usage_events', 'CREATE INDEX IF NOT EXISTS idx_token_usage_session ON token_usage_events(session_id)');
      await db.query('token_usage_events', 'CREATE INDEX IF NOT EXISTS idx_token_usage_model ON token_usage_events(model)');
      await db.query('token_usage_events', 'CREATE INDEX IF NOT EXISTS idx_token_usage_created ON token_usage_events(created_at DESC)');
    },
    down: async (db: Database) => {
      await db.query('token_usage_events', 'DROP TABLE IF EXISTS token_usage_events');
      await db.query('execution_records', 'DROP TABLE IF EXISTS execution_records');
    }
  },
  {
    version: 22,
    name: 'add-agents-artifacts',
    up: async (db: Database) => {
      await db.query('agents', `
        CREATE TABLE IF NOT EXISTS agents (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          systemPrompt TEXT NOT NULL,
          model TEXT NOT NULL,
          provider TEXT,
          temperature REAL DEFAULT 0.7,
          maxTokens INTEGER DEFAULT 2000,
          tools TEXT,
          knowledgeBaseIds TEXT,
          icon TEXT,
          status TEXT NOT NULL DEFAULT 'draft',
          tenantId TEXT DEFAULT 'default',
          createdBy TEXT,
          createdAt TEXT NOT NULL,
          updatedAt TEXT NOT NULL,
          metadata TEXT
        )
      `);
      await db.query('agents', 'CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status)');
      await db.query('agents', 'CREATE INDEX IF NOT EXISTS idx_agents_tenant ON agents(tenantId)');

      await db.query('artifacts', `
        CREATE TABLE IF NOT EXISTS artifacts (
          id TEXT PRIMARY KEY,
          sessionId TEXT,
          agentId TEXT,
          type TEXT NOT NULL,
          name TEXT NOT NULL,
          path TEXT,
          size INTEGER DEFAULT 0,
          mimeType TEXT,
          metadata TEXT,
          createdAt TEXT NOT NULL
        )
      `);
      await db.query('artifacts', 'CREATE INDEX IF NOT EXISTS idx_artifacts_session ON artifacts(sessionId)');
      await db.query('artifacts', 'CREATE INDEX IF NOT EXISTS idx_artifacts_agent ON artifacts(agentId)');
      await db.query('artifacts', 'CREATE INDEX IF NOT EXISTS idx_artifacts_type ON artifacts(type)');
    },
    down: async (db: Database) => {
      await db.query('agents', 'DROP TABLE IF EXISTS agents');
      await db.query('artifacts', 'DROP TABLE IF EXISTS artifacts');
    }
  },
  {
    version: 23,
    name: 'add-workflows-table',
    up: async (db: Database) => {
      await db.query('workflows', `
        CREATE TABLE IF NOT EXISTS workflows (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          steps TEXT NOT NULL DEFAULT '[]',
          triggers TEXT NOT NULL DEFAULT '[]',
          status TEXT NOT NULL DEFAULT 'draft',
          tenantId TEXT DEFAULT 'default',
          createdBy TEXT,
          createdAt TEXT NOT NULL,
          updatedAt TEXT NOT NULL,
          metadata TEXT
        )
      `);
      await db.query('workflows', 'CREATE INDEX IF NOT EXISTS idx_workflows_status ON workflows(status)');
      await db.query('workflows', 'CREATE INDEX IF NOT EXISTS idx_workflows_tenant ON workflows(tenantId)');
      await db.query('workflows', 'CREATE INDEX IF NOT EXISTS idx_workflows_created ON workflows(createdAt DESC)');

      await db.query('workflow_executions', `
        CREATE TABLE IF NOT EXISTS workflow_executions (
          id TEXT PRIMARY KEY,
          workflowId TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'running',
          input TEXT,
          result TEXT,
          error TEXT,
          startedAt TEXT NOT NULL,
          completedAt TEXT,
          createdAt TEXT NOT NULL
        )
      `);
      await db.query('workflow_executions', 'CREATE INDEX IF NOT EXISTS idx_wf_exec_workflow ON workflow_executions(workflowId)');
      await db.query('workflow_executions', 'CREATE INDEX IF NOT EXISTS idx_wf_exec_status ON workflow_executions(status)');
    },
    down: async (db: Database) => {
      await db.query('workflows', 'DROP TABLE IF EXISTS workflows');
      await db.query('workflow_executions', 'DROP TABLE IF EXISTS workflow_executions');
    }
  },
  {
    version: 26,
    name: 'add-agent-versioning',
    up: async (db: Database) => {
      await db.query('agent_versions', `
        CREATE TABLE IF NOT EXISTS agent_versions (
          id TEXT PRIMARY KEY,
          agent_id TEXT NOT NULL,
          version INTEGER NOT NULL,
          name TEXT NOT NULL,
          description TEXT,
          systemPrompt TEXT NOT NULL,
          model TEXT NOT NULL,
          provider TEXT,
          temperature REAL DEFAULT 0.7,
          maxTokens INTEGER DEFAULT 2000,
          tools TEXT,
          knowledgeBaseIds TEXT,
          icon TEXT,
          created_by TEXT,
          created_at TEXT NOT NULL,
          FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
        )
      `);
      await db.query('agent_versions', 'CREATE INDEX IF NOT EXISTS idx_agent_versions_agent ON agent_versions(agent_id)');
      await db.query('agent_versions', 'CREATE INDEX IF NOT EXISTS idx_agent_versions_version ON agent_versions(agent_id, version DESC)');

      // Add current_version column to agents table
      const cols = (await db.query('agents', `SELECT name FROM pragma_table_info('agents')`)).rows as any[];
      if (!cols.some((c: any) => c.name === 'current_version')) {
        await db.query('agents', 'ALTER TABLE agents ADD COLUMN current_version INTEGER DEFAULT 1');
      }
    },
    down: async (db: Database) => {
      await db.query('agent_versions', 'DROP TABLE IF EXISTS agent_versions');
      await db.query('agents', 'ALTER TABLE agents DROP COLUMN current_version');
    }
  },
  {
    version: 25,
    name: 'add-notification-tables',
    up: async (db: Database) => {
      await db.query('notification_channels', `
        CREATE TABLE IF NOT EXISTS notification_channels (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          type TEXT NOT NULL,
          name TEXT NOT NULL,
          config TEXT NOT NULL,
          enabled INTEGER DEFAULT 1,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `);
      await db.query('notification_channels', 'CREATE INDEX IF NOT EXISTS idx_notification_channels_user ON notification_channels(user_id)');
      await db.query('notification_channels', 'CREATE INDEX IF NOT EXISTS idx_notification_channels_type ON notification_channels(type)');

      await db.query('alert_rules', `
        CREATE TABLE IF NOT EXISTS alert_rules (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          name TEXT NOT NULL,
          rule_type TEXT NOT NULL,
          threshold REAL NOT NULL,
          window_minutes INTEGER DEFAULT 60,
          channels TEXT NOT NULL,
          enabled INTEGER DEFAULT 1,
          last_triggered_at TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `);
      await db.query('alert_rules', 'CREATE INDEX IF NOT EXISTS idx_alert_rules_user ON alert_rules(user_id)');
      await db.query('alert_rules', 'CREATE INDEX IF NOT EXISTS idx_alert_rules_type ON alert_rules(rule_type)');

      await db.query('notifications', `
        CREATE TABLE IF NOT EXISTS notifications (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          channel_id TEXT,
          alert_rule_id TEXT,
          type TEXT NOT NULL,
          title TEXT NOT NULL,
          content TEXT NOT NULL,
          severity TEXT DEFAULT 'info',
          read INTEGER DEFAULT 0,
          metadata TEXT,
          created_at TEXT NOT NULL
        )
      `);
      await db.query('notifications', 'CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id)');
      await db.query('notifications', 'CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read)');
      await db.query('notifications', 'CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC)');
    },
    down: async (db: Database) => {
      await db.query('notifications', 'DROP TABLE IF EXISTS notifications');
      await db.query('alert_rules', 'DROP TABLE IF EXISTS alert_rules');
      await db.query('notification_channels', 'DROP TABLE IF EXISTS notification_channels');
    }
  },
  {
    version: 24,
    name: 'add-knowledge-base-tables',
    up: async (db: Database) => {
      await db.query('knowledge_bases', `
        CREATE TABLE IF NOT EXISTS knowledge_bases (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          name TEXT NOT NULL,
          description TEXT,
          embedding_model TEXT NOT NULL DEFAULT 'text-embedding-3-small',
          chunk_size INTEGER DEFAULT 500,
          chunk_overlap INTEGER DEFAULT 50,
          status TEXT NOT NULL DEFAULT 'active',
          document_count INTEGER DEFAULT 0,
          chunk_count INTEGER DEFAULT 0,
          metadata TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `);
      await db.query('knowledge_bases', 'CREATE INDEX IF NOT EXISTS idx_knowledge_bases_user_id ON knowledge_bases(user_id)');
      await db.query('knowledge_bases', 'CREATE INDEX IF NOT EXISTS idx_knowledge_bases_status ON knowledge_bases(status)');

      await db.query('documents', `
        CREATE TABLE IF NOT EXISTS documents (
          id TEXT PRIMARY KEY,
          knowledge_base_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          name TEXT NOT NULL,
          type TEXT NOT NULL,
          mime_type TEXT,
          size INTEGER DEFAULT 0,
          path TEXT NOT NULL,
          checksum TEXT,
          status TEXT NOT NULL DEFAULT 'pending',
          chunk_count INTEGER DEFAULT 0,
          error_message TEXT,
          metadata TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (knowledge_base_id) REFERENCES knowledge_bases(id) ON DELETE CASCADE
        )
      `);
      await db.query('documents', 'CREATE INDEX IF NOT EXISTS idx_documents_kb_id ON documents(knowledge_base_id)');
      await db.query('documents', 'CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status)');
      await db.query('documents', 'CREATE INDEX IF NOT EXISTS idx_documents_user_id ON documents(user_id)');

      await db.query('document_chunks', `
        CREATE TABLE IF NOT EXISTS document_chunks (
          id TEXT PRIMARY KEY,
          document_id TEXT NOT NULL,
          knowledge_base_id TEXT NOT NULL,
          content TEXT NOT NULL,
          chunk_index INTEGER NOT NULL,
          token_count INTEGER DEFAULT 0,
          embedding TEXT,
          metadata TEXT,
          created_at TEXT NOT NULL,
          FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
          FOREIGN KEY (knowledge_base_id) REFERENCES knowledge_bases(id) ON DELETE CASCADE
        )
      `);
      await db.query('document_chunks', 'CREATE INDEX IF NOT EXISTS idx_document_chunks_document_id ON document_chunks(document_id)');
      await db.query('document_chunks', 'CREATE INDEX IF NOT EXISTS idx_document_chunks_kb_id ON document_chunks(knowledge_base_id)');
    },
    down: async (db: Database) => {
      await db.query('document_chunks', 'DROP TABLE IF EXISTS document_chunks');
      await db.query('documents', 'DROP TABLE IF EXISTS documents');
      await db.query('knowledge_bases', 'DROP TABLE IF EXISTS knowledge_bases');
    }
  },
  v27Sqlite,
  v28Sqlite,
  v29Sqlite,
  v30Sqlite,
  v31Sqlite,
  v32Sqlite,
  v33Sqlite,
  v34Sqlite,
  v35Sqlite,
  v36Sqlite,
  v37Sqlite,
  v38Sqlite,
  v39Sqlite,
  v40Sqlite,
  v41Sqlite,
  v42Sqlite,
  v43Sqlite,
  v44Sqlite,
  v45Sqlite,
  v46Sqlite,
  v47Sqlite,
  v48Sqlite,
  v49Sqlite,
  v50Sqlite,
  v51Sqlite,
  v52Sqlite,
  v53Sqlite,
  v54Sqlite,
  v55Sqlite,
  v56Sqlite,
  v57Sqlite,
  v58Sqlite,
  v59Sqlite,
  v60Sqlite,
  v61Sqlite,
  v62Sqlite
];