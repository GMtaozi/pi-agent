export interface Repository<T> {
  findAll(): Promise<T[]>;
  findById(id: string): Promise<T | null>;
  create(item: Omit<T, 'id'>): Promise<T>;
  update(id: string, item: Partial<T>): Promise<T | null>;
  delete(id: string): Promise<boolean>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  findByField(field: string, value: any): Promise<T[]>;
}

export class BaseRepository<T> implements Repository<T> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  protected db: any;
  protected tableName: string;
  // Optional per-repository whitelist; when provided, findByField only accepts
  // these columns. Identifiers must always be valid SQL identifiers regardless.
  private allowedFields?: Set<string>;
  private static readonly IDENTIFIER_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  constructor(db: any, tableName: string, allowedFields?: string[]) {
    this.db = db;
    this.tableName = tableName;
    this.allowedFields = allowedFields ? new Set(allowedFields) : undefined;
  }

  async findAll(): Promise<T[]> {
    const result = await this.db.query(this.tableName, 'SELECT * FROM ' + this.tableName);
    return result.rows as T[];
  }

  async findById(id: string): Promise<T | null> {
    const result = await this.db.query(this.tableName, 'SELECT * FROM ' + this.tableName + ' WHERE id = ?', [id]);
    return (result.rows[0] as T) || null;
  }

  async create(item: Omit<T, 'id'>): Promise<T> {
    const keys = Object.keys(item);
    const values = Object.values(item);
    const placeholders = keys.map(() => '?').join(',');
    const sql = 'INSERT INTO ' + this.tableName + ' (' + keys.join(',') + ') VALUES (' + placeholders + ')';
    const result = await this.db.query(this.tableName, sql, values);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
    const newItem = { id: (result as any).lastInsertRowId?.toString() || Date.now().toString() + Math.random().toString(36).slice(2, 8), ...item } as T;
    return newItem;
  }

  async update(id: string, item: Partial<T>): Promise<T | null> {
    const existing = await this.findById(id);
    if (!existing) return null;
    
    const updated = { ...existing, ...item };
    const keys = Object.keys(updated).filter(k => k !== 'id');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
    const values = keys.map(k => (updated as any)[k]);
    const setClause = keys.map(k => k + ' = ?').join(', ');
    const sql = 'UPDATE ' + this.tableName + ' SET ' + setClause + ' WHERE id = ?';
    await this.db.query(this.tableName, sql, [...values, id]);
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db.query(this.tableName, 'DELETE FROM ' + this.tableName + ' WHERE id = ?', [id]);
    return result.rowsAffected > 0;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  async findByField(field: string, value: any): Promise<T[]> {
    // Security: the field name is interpolated into SQL, so reject anything
    // that is not a plain identifier or not on the repository whitelist.
    if (!BaseRepository.IDENTIFIER_RE.test(field)) {
      throw new Error('Invalid field name: ' + field);
    }
    if (this.allowedFields && !this.allowedFields.has(field)) {
      throw new Error('Field not allowed for query: ' + field);
    }
    const result = await this.db.query(this.tableName, 'SELECT * FROM ' + this.tableName + ' WHERE ' + field + ' = ?', [value]);
    return result.rows as T[];
  }
}