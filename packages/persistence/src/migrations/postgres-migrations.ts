import type { Migration } from '../database-types.js';
import type { PostgresDatabase } from '../postgres-database.js';
type Database = PostgresDatabase;

/**
 * PostgreSQL-compatible migrations for WorkForge.
 *
 * Uses UUID primary keys, JSONB for JSON columns, TIMESTAMPTZ for timestamps,
 * and pgvector extension for vector columns.
 *
 * These migrations are additive — they create the production schema without
 * touching the existing SQLite schema. Run them against a fresh PostgreSQL
 * database with the pgvector extension enabled.
 */
export const postgresMigrations: Migration[] = [
  {
    version: 1,
    name: 'pg-initial-schema',
    up: async (db: Database) => {
      // Enable required extensions
      await db.execute('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
      await db.execute('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');
      await db.execute('CREATE EXTENSION IF NOT EXISTS "vector"');

      // Users table
      await db.execute(`
        CREATE TABLE IF NOT EXISTS users (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          email VARCHAR(255) UNIQUE NOT NULL,
          password_hash VARCHAR(255) NOT NULL,
          name VARCHAR(100) NOT NULL,
          avatar_url TEXT,
          role VARCHAR(20) DEFAULT 'user' CHECK (role IN ('user', 'admin', 'superadmin')),
          plan VARCHAR(20) DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'enterprise')),
          status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended', 'deleted')),
          email_verified BOOLEAN DEFAULT FALSE,
          last_login_at TIMESTAMPTZ,
          login_count INTEGER DEFAULT 0,
          preferences JSONB DEFAULT '{}',
          api_key_encrypted TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await db.execute('CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)');
      await db.execute('CREATE INDEX IF NOT EXISTS idx_users_plan ON users(plan)');
      await db.execute('CREATE INDEX IF NOT EXISTS idx_users_status ON users(status)');
      await db.execute('CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at)');

      // Agents table
      await db.execute(`
        CREATE TABLE IF NOT EXISTS agents (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          name VARCHAR(200) NOT NULL,
          description TEXT,
          avatar_url TEXT,
          model VARCHAR(100) NOT NULL DEFAULT 'gpt-4o',
          system_prompt TEXT,
          temperature REAL DEFAULT 0.7 CHECK (temperature >= 0 AND temperature <= 2),
          max_tokens INTEGER DEFAULT 2000,
          top_p REAL DEFAULT 1.0,
          frequency_penalty REAL DEFAULT 0,
          presence_penalty REAL DEFAULT 0,
          knowledge_base_ids UUID[] DEFAULT '{}',
          tool_names TEXT[] DEFAULT '{}',
          tone VARCHAR(50) DEFAULT 'professional',
          language VARCHAR(10) DEFAULT 'zh',
          max_conversation_rounds INTEGER DEFAULT 20,
          transfer_on_unknown BOOLEAN DEFAULT TRUE,
          custom_greeting TEXT,
          suggested_questions TEXT[] DEFAULT '{}',
          status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'draft', 'archived')),
          is_public BOOLEAN DEFAULT FALSE,
          metadata JSONB DEFAULT '{}',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await db.execute('CREATE INDEX IF NOT EXISTS idx_agents_user_id ON agents(user_id)');
      await db.execute('CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status)');
      await db.execute('CREATE INDEX IF NOT EXISTS idx_agents_model ON agents(model)');
      await db.execute('CREATE INDEX IF NOT EXISTS idx_agents_is_public ON agents(is_public) WHERE is_public = TRUE');
      await db.execute('CREATE INDEX IF NOT EXISTS idx_agents_created_at ON agents(created_at)');

      // Sessions table
      await db.execute(`
        CREATE TABLE IF NOT EXISTS sessions (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
          title VARCHAR(500) DEFAULT 'New Chat',
          status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'archived', 'deleted')),
          mode VARCHAR(20) DEFAULT 'standard' CHECK (mode IN ('standard', 'debug')),
          total_tokens INTEGER DEFAULT 0,
          total_cost NUMERIC(10,6) DEFAULT 0,
          message_count INTEGER DEFAULT 0,
          metadata JSONB DEFAULT '{}',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await db.execute('CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)');
      await db.execute('CREATE INDEX IF NOT EXISTS idx_sessions_agent_id ON sessions(agent_id)');
      await db.execute('CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status)');
      await db.execute('CREATE INDEX IF NOT EXISTS idx_sessions_updated_at ON sessions(updated_at DESC)');
      await db.execute('CREATE INDEX IF NOT EXISTS idx_sessions_user_updated ON sessions(user_id, updated_at DESC)');

      // Messages table
      await db.execute(`
        CREATE TABLE IF NOT EXISTS messages (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
          role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
          content TEXT NOT NULL,
          tokens INTEGER DEFAULT 0,
          cost NUMERIC(10,6) DEFAULT 0,
          tool_name VARCHAR(200),
          tool_input JSONB,
          tool_output JSONB,
          model VARCHAR(100),
          metadata JSONB DEFAULT '{}',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await db.execute('CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id)');
      await db.execute('CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at)');
      await db.execute('CREATE INDEX IF NOT EXISTS idx_messages_session_created ON messages(session_id, created_at)');
      await db.execute('CREATE INDEX IF NOT EXISTS idx_messages_role ON messages(role)');

      // Executions table (for monitoring)
      await db.execute(`
        CREATE TABLE IF NOT EXISTS executions (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
          session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          status VARCHAR(20) NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed', 'stopped')),
          started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          completed_at TIMESTAMPTZ,
          duration_ms INTEGER,
          total_tokens INTEGER DEFAULT 0,
          prompt_tokens INTEGER DEFAULT 0,
          completion_tokens INTEGER DEFAULT 0,
          total_cost NUMERIC(10,6) DEFAULT 0,
          model VARCHAR(100) NOT NULL,
          error_message TEXT,
          metadata JSONB DEFAULT '{}',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await db.execute('CREATE INDEX IF NOT EXISTS idx_executions_agent_id ON executions(agent_id)');
      await db.execute('CREATE INDEX IF NOT EXISTS idx_executions_session_id ON executions(session_id)');
      await db.execute('CREATE INDEX IF NOT EXISTS idx_executions_user_id ON executions(user_id)');
      await db.execute('CREATE INDEX IF NOT EXISTS idx_executions_status ON executions(status)');
      await db.execute('CREATE INDEX IF NOT EXISTS idx_executions_started_at ON executions(started_at DESC)');
      await db.execute('CREATE INDEX IF NOT EXISTS idx_executions_agent_started ON executions(agent_id, started_at DESC)');
      await db.execute('CREATE INDEX IF NOT EXISTS idx_executions_user_started ON executions(user_id, started_at DESC)');

      // Node executions table (for debugging/tracing)
      await db.execute(`
        CREATE TABLE IF NOT EXISTS node_executions (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          execution_id UUID NOT NULL REFERENCES executions(id) ON DELETE CASCADE,
          node_id VARCHAR(200) NOT NULL,
          node_type VARCHAR(100) NOT NULL,
          status VARCHAR(20) NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed', 'skipped')),
          started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          completed_at TIMESTAMPTZ,
          duration_ms INTEGER,
          tokens INTEGER DEFAULT 0,
          prompt_tokens INTEGER DEFAULT 0,
          completion_tokens INTEGER DEFAULT 0,
          cost NUMERIC(10,6) DEFAULT 0,
          input JSONB,
          output JSONB,
          error TEXT,
          parent_node_id VARCHAR(200),
          metadata JSONB DEFAULT '{}'
        )
      `);
      await db.execute('CREATE INDEX IF NOT EXISTS idx_node_executions_execution_id ON node_executions(execution_id)');
      await db.execute('CREATE INDEX IF NOT EXISTS idx_node_executions_node_id ON node_executions(node_id)');
      await db.execute('CREATE INDEX IF NOT EXISTS idx_node_executions_status ON node_executions(status)');
      await db.execute('CREATE INDEX IF NOT EXISTS idx_node_executions_node_type ON node_executions(node_type)');

      // Token usage table
      await db.execute(`
        CREATE TABLE IF NOT EXISTS token_usage (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          execution_id UUID REFERENCES executions(id) ON DELETE SET NULL,
          session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,
          agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          model VARCHAR(100) NOT NULL,
          prompt_tokens INTEGER NOT NULL,
          completion_tokens INTEGER NOT NULL,
          total_tokens INTEGER NOT NULL,
          cost NUMERIC(10,6) NOT NULL,
          timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await db.execute('CREATE INDEX IF NOT EXISTS idx_token_usage_execution_id ON token_usage(execution_id)');
      await db.execute('CREATE INDEX IF NOT EXISTS idx_token_usage_agent_id ON token_usage(agent_id)');
      await db.execute('CREATE INDEX IF NOT EXISTS idx_token_usage_user_id ON token_usage(user_id)');
      await db.execute('CREATE INDEX IF NOT EXISTS idx_token_usage_timestamp ON token_usage(timestamp)');
      await db.execute('CREATE INDEX IF NOT EXISTS idx_token_usage_model ON token_usage(model)');
      await db.execute('CREATE INDEX IF NOT EXISTS idx_token_usage_user_timestamp ON token_usage(user_id, timestamp)');

      // Daily stats table
      await db.execute(`
        CREATE TABLE IF NOT EXISTS daily_stats (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
          date DATE NOT NULL,
          total_executions INTEGER DEFAULT 0,
          successful_executions INTEGER DEFAULT 0,
          failed_executions INTEGER DEFAULT 0,
          total_tokens INTEGER DEFAULT 0,
          total_cost NUMERIC(10,6) DEFAULT 0,
          avg_duration_ms INTEGER DEFAULT 0,
          UNIQUE(user_id, agent_id, date)
        )
      `);
      await db.execute('CREATE INDEX IF NOT EXISTS idx_daily_stats_user_date ON daily_stats(user_id, date)');
      await db.execute('CREATE INDEX IF NOT EXISTS idx_daily_stats_agent_date ON daily_stats(agent_id, date)');
      await db.execute('CREATE INDEX IF NOT EXISTS idx_daily_stats_date ON daily_stats(date)');

      // Knowledge bases table
      await db.execute(`
        CREATE TABLE IF NOT EXISTS knowledge_bases (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          name VARCHAR(200) NOT NULL,
          description TEXT,
          embedding_model VARCHAR(100) DEFAULT 'text-embedding-3-small',
          chunk_size INTEGER DEFAULT 500,
          chunk_overlap INTEGER DEFAULT 50,
          status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'indexing', 'error')),
          document_count INTEGER DEFAULT 0,
          chunk_count INTEGER DEFAULT 0,
          metadata JSONB DEFAULT '{}',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await db.execute('CREATE INDEX IF NOT EXISTS idx_knowledge_bases_user_id ON knowledge_bases(user_id)');
      await db.execute('CREATE INDEX IF NOT EXISTS idx_knowledge_bases_status ON knowledge_bases(status)');

      // Documents table
      await db.execute(`
        CREATE TABLE IF NOT EXISTS documents (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          knowledge_base_id UUID NOT NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE,
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          name VARCHAR(500) NOT NULL,
          type VARCHAR(50) NOT NULL,
          mime_type VARCHAR(100),
          size BIGINT NOT NULL DEFAULT 0,
          path TEXT NOT NULL,
          checksum VARCHAR(64),
          status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'indexing', 'indexed', 'failed')),
          chunk_count INTEGER DEFAULT 0,
          error_message TEXT,
          metadata JSONB DEFAULT '{}',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await db.execute('CREATE INDEX IF NOT EXISTS idx_documents_kb_id ON documents(knowledge_base_id)');
      await db.execute('CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status)');
      await db.execute('CREATE INDEX IF NOT EXISTS idx_documents_user_id ON documents(user_id)');

      // Document chunks table (with pgvector)
      await db.execute(`
        CREATE TABLE IF NOT EXISTS document_chunks (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
          knowledge_base_id UUID NOT NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE,
          content TEXT NOT NULL,
          chunk_index INTEGER NOT NULL,
          token_count INTEGER DEFAULT 0,
          embedding vector(1536),
          metadata JSONB DEFAULT '{}',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await db.execute('CREATE INDEX IF NOT EXISTS idx_document_chunks_document_id ON document_chunks(document_id)');
      await db.execute('CREATE INDEX IF NOT EXISTS idx_document_chunks_kb_id ON document_chunks(knowledge_base_id)');
      await db.execute('CREATE INDEX IF NOT EXISTS idx_document_chunks_embedding ON document_chunks USING ivfflat (embedding vector_cosine_ops)');

      // Tools table
      await db.execute(`
        CREATE TABLE IF NOT EXISTS tools (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          name VARCHAR(200) UNIQUE NOT NULL,
          description TEXT,
          category VARCHAR(50) DEFAULT 'custom' CHECK (category IN ('builtin', 'http', 'code', 'custom')),
          icon VARCHAR(100),
          parameters JSONB NOT NULL DEFAULT '{}',
          execution_config JSONB NOT NULL DEFAULT '{}',
          error_handling JSONB DEFAULT '{}',
          user_id UUID REFERENCES users(id) ON DELETE SET NULL,
          enabled BOOLEAN DEFAULT TRUE,
          success_count INTEGER DEFAULT 0,
          failure_count INTEGER DEFAULT 0,
          avg_duration_ms INTEGER DEFAULT 0,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await db.execute('CREATE INDEX IF NOT EXISTS idx_tools_category ON tools(category)');
      await db.execute('CREATE INDEX IF NOT EXISTS idx_tools_user_id ON tools(user_id)');
      await db.execute('CREATE INDEX IF NOT EXISTS idx_tools_enabled ON tools(enabled)');

      // Tool calls table
      await db.execute(`
        CREATE TABLE IF NOT EXISTS tool_calls (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          tool_name VARCHAR(200) NOT NULL REFERENCES tools(name) ON DELETE CASCADE,
          execution_id UUID REFERENCES executions(id) ON DELETE SET NULL,
          session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          parameters JSONB,
          result JSONB,
          status VARCHAR(20) DEFAULT 'success' CHECK (status IN ('success', 'failed', 'timeout')),
          duration_ms INTEGER,
          error TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await db.execute('CREATE INDEX IF NOT EXISTS idx_tool_calls_tool_name ON tool_calls(tool_name)');
      await db.execute('CREATE INDEX IF NOT EXISTS idx_tool_calls_execution_id ON tool_calls(execution_id)');
      await db.execute('CREATE INDEX IF NOT EXISTS idx_tool_calls_session_id ON tool_calls(session_id)');
      await db.execute('CREATE INDEX IF NOT EXISTS idx_tool_calls_user_id ON tool_calls(user_id)');
      await db.execute('CREATE INDEX IF NOT EXISTS idx_tool_calls_created_at ON tool_calls(created_at)');

      // Execution records (driver-agnostic monitoring tables; TEXT ids so the
      // same service code works on both SQLite and PostgreSQL).
      await db.execute(`
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
          cost DOUBLE PRECISION DEFAULT 0,
          error_message TEXT,
          metadata TEXT,
          created_at TEXT NOT NULL
        )
      `);
      await db.execute('CREATE INDEX IF NOT EXISTS idx_exec_records_session ON execution_records(session_id)');
      await db.execute('CREATE INDEX IF NOT EXISTS idx_exec_records_agent ON execution_records(agent_id)');
      await db.execute('CREATE INDEX IF NOT EXISTS idx_exec_records_user ON execution_records(user_id)');
      await db.execute('CREATE INDEX IF NOT EXISTS idx_exec_records_status ON execution_records(status)');
      await db.execute('CREATE INDEX IF NOT EXISTS idx_exec_records_started ON execution_records(started_at DESC)');
      await db.execute('CREATE INDEX IF NOT EXISTS idx_exec_records_model ON execution_records(model)');

      // Token usage events: one row per LLM call inside an execution.
      await db.execute(`
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
          cost DOUBLE PRECISION DEFAULT 0,
          latency_ms INTEGER DEFAULT 0,
          created_at TEXT NOT NULL
        )
      `);
      await db.execute('CREATE INDEX IF NOT EXISTS idx_token_usage_exec ON token_usage_events(execution_id)');
      await db.execute('CREATE INDEX IF NOT EXISTS idx_token_usage_session ON token_usage_events(session_id)');
      await db.execute('CREATE INDEX IF NOT EXISTS idx_token_usage_model ON token_usage_events(model)');
      await db.execute('CREATE INDEX IF NOT EXISTS idx_token_usage_created ON token_usage_events(created_at DESC)');

      // Artifacts table
      await db.execute(`
        CREATE TABLE IF NOT EXISTS artifacts (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          workspace_id UUID NOT NULL,
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          name VARCHAR(500) NOT NULL,
          type VARCHAR(50) NOT NULL,
          mime_type VARCHAR(100),
          path TEXT NOT NULL,
          size BIGINT DEFAULT 0,
          version INTEGER DEFAULT 1,
          content_preview TEXT,
          metadata JSONB DEFAULT '{}',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await db.execute('CREATE INDEX IF NOT EXISTS idx_artifacts_workspace_id ON artifacts(workspace_id)');
      await db.execute('CREATE INDEX IF NOT EXISTS idx_artifacts_user_id ON artifacts(user_id)');
      await db.execute('CREATE INDEX IF NOT EXISTS idx_artifacts_type ON artifacts(type)');
      await db.execute('CREATE INDEX IF NOT EXISTS idx_artifacts_updated_at ON artifacts(updated_at DESC)');

      // Artifact versions table
      await db.execute(`
        CREATE TABLE IF NOT EXISTS artifact_versions (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          artifact_id UUID NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
          version INTEGER NOT NULL,
          content TEXT NOT NULL,
          change_description TEXT,
          size BIGINT DEFAULT 0,
          created_by UUID NOT NULL REFERENCES users(id),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE(artifact_id, version)
        )
      `);
      await db.execute('CREATE INDEX IF NOT EXISTS idx_artifact_versions_artifact_id ON artifact_versions(artifact_id)');
      await db.execute('CREATE INDEX IF NOT EXISTS idx_artifact_versions_version ON artifact_versions(version)');

      // Memory chunks table
      await db.execute(`
        CREATE TABLE IF NOT EXISTS memory_chunks (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,
          type VARCHAR(50) DEFAULT 'fact' CHECK (type IN ('fact', 'preference', 'context', 'artifact_summary')),
          content TEXT NOT NULL,
          summary TEXT,
          tags TEXT[] DEFAULT '{}',
          embedding vector(1536),
          importance REAL DEFAULT 0.5 CHECK (importance >= 0 AND importance <= 1),
          expires_at TIMESTAMPTZ,
          metadata JSONB DEFAULT '{}',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await db.execute('CREATE INDEX IF NOT EXISTS idx_memory_chunks_user_id ON memory_chunks(user_id)');
      await db.execute('CREATE INDEX IF NOT EXISTS idx_memory_chunks_session_id ON memory_chunks(session_id)');
      await db.execute('CREATE INDEX IF NOT EXISTS idx_memory_chunks_type ON memory_chunks(type)');
      await db.execute('CREATE INDEX IF NOT EXISTS idx_memory_chunks_expires_at ON memory_chunks(expires_at)');
      await db.execute('CREATE INDEX IF NOT EXISTS idx_memory_chunks_tags ON memory_chunks USING GIN(tags)');
      await db.execute('CREATE INDEX IF NOT EXISTS idx_memory_chunks_embedding ON memory_chunks USING ivfflat (embedding vector_cosine_ops)');

      // Schedules table
      await db.execute(`
        CREATE TABLE IF NOT EXISTS schedules (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
          name VARCHAR(200) NOT NULL,
          description TEXT,
          cron_expression VARCHAR(100) NOT NULL,
          prompt TEXT NOT NULL,
          enabled BOOLEAN DEFAULT TRUE,
          last_run_at TIMESTAMPTZ,
          next_run_at TIMESTAMPTZ,
          run_count INTEGER DEFAULT 0,
          max_runs INTEGER,
          metadata JSONB DEFAULT '{}',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await db.execute('CREATE INDEX IF NOT EXISTS idx_schedules_user_id ON schedules(user_id)');
      await db.execute('CREATE INDEX IF NOT EXISTS idx_schedules_agent_id ON schedules(agent_id)');
      await db.execute('CREATE INDEX IF NOT EXISTS idx_schedules_enabled ON schedules(enabled)');
      await db.execute('CREATE INDEX IF NOT EXISTS idx_schedules_next_run_at ON schedules(next_run_at)');

      // Approvals table
      await db.execute(`
        CREATE TABLE IF NOT EXISTS approvals (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          action VARCHAR(200) NOT NULL,
          resource_type VARCHAR(100) NOT NULL,
          resource_id UUID NOT NULL,
          details JSONB,
          status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
          decided_at TIMESTAMPTZ,
          decided_by UUID REFERENCES users(id),
          reason TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await db.execute('CREATE INDEX IF NOT EXISTS idx_approvals_user_id ON approvals(user_id)');
      await db.execute('CREATE INDEX IF NOT EXISTS idx_approvals_status ON approvals(status)');
      await db.execute('CREATE INDEX IF NOT EXISTS idx_approvals_resource ON approvals(resource_type, resource_id)');
      await db.execute('CREATE INDEX IF NOT EXISTS idx_approvals_status_created ON approvals(status, created_at)');

      // Audit logs table
      await db.execute(`
        CREATE TABLE IF NOT EXISTS audit_logs (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          action VARCHAR(200) NOT NULL,
          resource_type VARCHAR(100),
          resource_id UUID,
          details JSONB,
          ip_address INET,
          user_agent TEXT,
          result VARCHAR(20) DEFAULT 'success' CHECK (result IN ('success', 'failure')),
          error TEXT,
          timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await db.execute('CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id)');
      await db.execute('CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action)');
      await db.execute('CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp)');
      await db.execute('CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON audit_logs(resource_type, resource_id)');
      await db.execute('CREATE INDEX IF NOT EXISTS idx_audit_logs_user_timestamp ON audit_logs(user_id, timestamp)');

      // Debug sessions table
      await db.execute(`
        CREATE TABLE IF NOT EXISTS debug_sessions (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
          execution_id UUID REFERENCES executions(id) ON DELETE SET NULL,
          status VARCHAR(20) DEFAULT 'running' CHECK (status IN ('running', 'paused', 'completed', 'aborted')),
          mode VARCHAR(20) DEFAULT 'normal' CHECK (mode IN ('normal', 'step', 'breakpoint')),
          breakpoints JSONB DEFAULT '[]',
          variables JSONB DEFAULT '{}',
          current_node_id VARCHAR(200),
          started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          completed_at TIMESTAMPTZ
        )
      `);
      await db.execute('CREATE INDEX IF NOT EXISTS idx_debug_sessions_user_id ON debug_sessions(user_id)');
      await db.execute('CREATE INDEX IF NOT EXISTS idx_debug_sessions_agent_id ON debug_sessions(agent_id)');
      await db.execute('CREATE INDEX IF NOT EXISTS idx_debug_sessions_status ON debug_sessions(status)');
      await db.execute('CREATE INDEX IF NOT EXISTS idx_debug_sessions_execution_id ON debug_sessions(execution_id)');

      // Settings table
      await db.execute(`
        CREATE TABLE IF NOT EXISTS settings (
          key VARCHAR(200) PRIMARY KEY,
          value JSONB NOT NULL,
          description TEXT,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      // User preferences table
      await db.execute(`
        CREATE TABLE IF NOT EXISTS user_preferences (
          user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          preferences JSONB NOT NULL DEFAULT '{}',
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      // Tenants table
      await db.execute(`
        CREATE TABLE IF NOT EXISTS tenants (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          name VARCHAR(200) NOT NULL,
          plan VARCHAR(20) DEFAULT 'free',
          quota JSONB DEFAULT '{}',
          settings JSONB DEFAULT '{}',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await db.execute('CREATE INDEX IF NOT EXISTS idx_tenants_plan ON tenants(plan)');

      // Tasks table
      await db.execute(`
        CREATE TABLE IF NOT EXISTS tasks (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          workspace_id UUID,
          user_id UUID REFERENCES users(id) ON DELETE CASCADE,
          type VARCHAR(100),
          status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
          input JSONB,
          result JSONB,
          error TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          completed_at TIMESTAMPTZ
        )
      `);
      await db.execute('CREATE INDEX IF NOT EXISTS idx_tasks_workspace_id ON tasks(workspace_id)');
      await db.execute('CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON tasks(user_id)');
      await db.execute('CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)');

      // Feedback table
      await db.execute(`
        CREATE TABLE IF NOT EXISTS feedback (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
          message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
          comment TEXT,
          feedback_type VARCHAR(50) DEFAULT 'quick',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await db.execute('CREATE INDEX IF NOT EXISTS idx_feedback_session_id ON feedback(session_id)');
      await db.execute('CREATE INDEX IF NOT EXISTS idx_feedback_user_id ON feedback(user_id)');
      await db.execute('CREATE INDEX IF NOT EXISTS idx_feedback_rating ON feedback(rating)');

      // Feature flags table
      await db.execute(`
        CREATE TABLE IF NOT EXISTS feature_flags (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          name VARCHAR(200) UNIQUE NOT NULL,
          enabled BOOLEAN DEFAULT FALSE,
          rollout_percentage INTEGER DEFAULT 0,
          target_users UUID[] DEFAULT '{}',
          target_tenants UUID[] DEFAULT '{}',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      // Market skills table
      await db.execute(`
        CREATE TABLE IF NOT EXISTS market_skills (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          name VARCHAR(200) UNIQUE NOT NULL,
          description TEXT,
          version VARCHAR(50) DEFAULT '1.0.0',
          manifest JSONB NOT NULL,
          author VARCHAR(200),
          category VARCHAR(100),
          downloads INTEGER DEFAULT 0,
          rating REAL DEFAULT 0,
          rating_count INTEGER DEFAULT 0,
          enabled BOOLEAN DEFAULT TRUE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await db.execute('CREATE INDEX IF NOT EXISTS idx_market_skills_category ON market_skills(category)');
      await db.execute('CREATE INDEX IF NOT EXISTS idx_market_skills_enabled ON market_skills(enabled)');
      await db.execute('CREATE INDEX IF NOT EXISTS idx_market_skills_downloads ON market_skills(downloads DESC)');

      // Presets table
      await db.execute(`
        CREATE TABLE IF NOT EXISTS presets (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          name VARCHAR(200) NOT NULL,
          description TEXT,
          mode VARCHAR(50) NOT NULL,
          tools TEXT[] DEFAULT '{}',
          system_prompt TEXT NOT NULL,
          context TEXT NOT NULL,
          builtin BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await db.execute('CREATE INDEX IF NOT EXISTS idx_presets_mode ON presets(mode)');

      // Prompt versions table
      await db.execute(`
        CREATE TABLE IF NOT EXISTS prompt_versions (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          name VARCHAR(200) NOT NULL,
          prompt TEXT NOT NULL,
          version VARCHAR(50) NOT NULL,
          is_active BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      // Experiments table
      await db.execute(`
        CREATE TABLE IF NOT EXISTS experiments (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          name VARCHAR(200) NOT NULL,
          control_prompt_id UUID REFERENCES prompt_versions(id),
          treatment_prompt_id UUID REFERENCES prompt_versions(id),
          rollout_percentage INTEGER DEFAULT 0,
          metrics JSONB DEFAULT '{}',
          status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'running', 'completed', 'archived')),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      // Custom models table
      await db.execute(`
        CREATE TABLE IF NOT EXISTS custom_models (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          name VARCHAR(200) NOT NULL,
          provider VARCHAR(100) NOT NULL,
          endpoint TEXT NOT NULL,
          api_key TEXT NOT NULL,
          model_params JSONB DEFAULT '{}',
          enabled BOOLEAN DEFAULT TRUE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await db.execute('CREATE INDEX IF NOT EXISTS idx_custom_models_provider ON custom_models(provider)');

      // Create updated_at triggers
      await db.execute(`
        CREATE OR REPLACE FUNCTION update_updated_at_column()
        RETURNS TRIGGER AS $$
        BEGIN
          NEW.updated_at = NOW();
          RETURN NEW;
        END;
        $$ language 'plpgsql');
      `);

      const triggerTables = [
        'users', 'agents', 'sessions', 'knowledge_bases', 'documents',
        'tools', 'artifacts', 'memory_chunks', 'schedules', 'tenants',
        'tasks', 'feature_flags', 'market_skills', 'presets', 'experiments',
        'custom_models'
      ];

      for (const table of triggerTables) {
        await db.execute(`
          DROP TRIGGER IF EXISTS update_${table}_updated_at ON ${table};
          CREATE TRIGGER update_${table}_updated_at
            BEFORE UPDATE ON ${table}
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
        `);
      }
    },
    down: async (db: Database) => {
      // Drop all tables in reverse dependency order
      const tables = [
        'experiments', 'prompt_versions', 'presets', 'market_skills',
        'feature_flags', 'feedback', 'tasks', 'audit_logs', 'approvals',
        'debug_sessions', 'schedules', 'memory_chunks', 'artifact_versions',
        'artifacts', 'tool_calls', 'tools', 'document_chunks', 'documents',
        'knowledge_bases', 'token_usage', 'node_executions', 'executions',
        'token_usage_events', 'execution_records',
        'messages', 'sessions', 'agents', 'daily_stats', 'user_preferences',
        'settings', 'tenants', 'custom_models', 'users'
      ];
      for (const table of tables) {
        await db.execute(`DROP TABLE IF EXISTS ${table} CASCADE`);
      }
      await db.execute('DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE');
    }
  }
];
