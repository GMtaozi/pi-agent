import { randomUUID } from 'crypto';

/** Minimal structural type for the persistence database (SQLite or PostgreSQL). */
export interface DbLike {
  query(table: string, sql: string, params?: unknown[]): Promise<{ rows: unknown[]; rowsAffected: number }>;
  execute(sql: string, params?: unknown[]): Promise<{ rows: unknown[]; rowsAffected: number }>;
}

export interface SpanRecord {
  id: string;
  session_id: string;
  trace_id: string;
  span_id: string;
  parent_span_id: string | null;
  operation: string;
  started_at: string;
  ended_at: string | null;
  status: string;
  input: string;
  output: string;
  metadata: string;
  created_at: string;
}

export interface StartSpanInput {
  sessionId: string;
  traceId?: string;
  parentSpanId?: string;
  operation: string;
  input?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface EndSpanInput {
  status?: string;
  output?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface SpanNode extends SpanRecord {
  children: SpanNode[];
  durationMs: number | null;
}

/**
 * TraceService — 调用链追踪（span 记录、拓扑构建）
 *
 * 负责：
 * - 创建和结束 span
 * - 构建调用链树形拓扑
 * - 查询 trace 下的所有 span
 */
export class TraceService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  constructor(private db: any) {}

  /**
   * 开始一个新的 span
   */
  async startSpan(input: StartSpanInput): Promise<SpanRecord> {
    const id = randomUUID();
    const traceId = input.traceId || randomUUID();
    const spanId = randomUUID();
    const now = new Date().toISOString();

    const record: SpanRecord = {
      id,
      session_id: input.sessionId,
      trace_id: traceId,
      span_id: spanId,
      parent_span_id: input.parentSpanId || null,
      operation: input.operation,
      started_at: now,
      ended_at: null,
      status: 'active',
      input: JSON.stringify(input.input || {}),
      output: '{}',
      metadata: JSON.stringify(input.metadata || {}),
      created_at: now,
    };

    await this.db.query(
      'observability_traces',
      `INSERT INTO observability_traces
        (id, session_id, trace_id, span_id, parent_span_id, operation, started_at, ended_at, status, input, output, metadata, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        record.id, record.session_id, record.trace_id, record.span_id,
        record.parent_span_id, record.operation, record.started_at, record.ended_at,
        record.status, record.input, record.output, record.metadata, record.created_at,
      ]
    );

    return record;
  }

  /**
   * 结束一个 span
   */
  async endSpan(spanId: string, input: EndSpanInput): Promise<void> {
    const now = new Date().toISOString();

    const existing = await this.db.query(
      'observability_traces',
      'SELECT * FROM observability_traces WHERE span_id = ?',
      [spanId]
    );

    if (existing.rows.length === 0) return;

    const span = existing.rows[0] as SpanRecord;
    const mergedMetadata = { ...JSON.parse(span.metadata), ...(input.metadata || {}) };

    await this.db.query(
      'observability_traces',
      `UPDATE observability_traces
       SET ended_at = ?, status = ?, output = ?, metadata = ?
       WHERE span_id = ?`,
      [
        now,
        input.status || 'completed',
        JSON.stringify(input.output || {}),
        JSON.stringify(mergedMetadata),
        spanId,
      ]
    );
  }

  /**
   * 获取指定 trace 下的所有 span
   */
  async getTraceSpans(traceId: string): Promise<SpanRecord[]> {
    const result = await this.db.query(
      'observability_traces',
      'SELECT * FROM observability_traces WHERE trace_id = ? ORDER BY started_at ASC',
      [traceId]
    );
    return result.rows as SpanRecord[];
  }

  /**
   * 构建调用链树形拓扑
   */
  async buildTraceTree(traceId: string): Promise<SpanNode[]> {
    const spans = await this.getTraceSpans(traceId);
    const spanMap = new Map<string, SpanNode>();

    // 初始化所有节点
    for (const span of spans) {
      const durationMs = span.ended_at
        ? new Date(span.ended_at).getTime() - new Date(span.started_at).getTime()
        : null;
      spanMap.set(span.span_id, { ...span, children: [], durationMs });
    }

    // 构建树形结构
    const roots: SpanNode[] = [];
    for (const node of spanMap.values()) {
      if (node.parent_span_id && spanMap.has(node.parent_span_id)) {
        spanMap.get(node.parent_span_id)!.children.push(node);
      } else {
        roots.push(node);
      }
    }

    return roots;
  }

  /**
   * 获取 session 下的所有 trace
   */
  async getSessionTraces(sessionId: string): Promise<string[]> {
    const result = await this.db.query(
      'observability_traces',
      'SELECT DISTINCT trace_id FROM observability_traces WHERE session_id = ? ORDER BY MIN(started_at) DESC',
      [sessionId]
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
    return result.rows.map((r: any) => r.trace_id);
  }

  /**
   * 获取 span 详情
   */
  async getSpan(spanId: string): Promise<SpanRecord | null> {
    const result = await this.db.query(
      'observability_traces',
      'SELECT * FROM observability_traces WHERE span_id = ?',
      [spanId]
    );
    return result.rows.length > 0 ? (result.rows[0] as SpanRecord) : null;
  }
}
