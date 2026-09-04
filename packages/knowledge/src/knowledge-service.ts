import { randomBytes } from 'crypto';

export interface KnowledgeBase {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  embedding_model: string;
  chunk_size: number;
  chunk_overlap: number;
  status: 'active' | 'inactive' | 'indexing' | 'error';
  document_count: number;
  chunk_count: number;
  metadata?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface Document {
  id: string;
  knowledge_base_id: string;
  user_id: string;
  name: string;
  type: string;
  mime_type?: string;
  size: number;
  path: string;
  checksum?: string;
  status: 'pending' | 'indexing' | 'indexed' | 'failed';
  chunk_count: number;
  error_message?: string;
  metadata?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface DocumentChunk {
  id: string;
  document_id: string;
  knowledge_base_id: string;
  content: string;
  chunk_index: number;
  token_count: number;
  embedding?: number[];
  metadata?: Record<string, any>;
  created_at: string;
}

export interface SearchResult {
  id: string;
  content: string;
  score: number;
  document_id: string;
  document_name: string;
  chunk_index: number;
  metadata?: Record<string, any>;
}

export interface SearchOptions {
  topK?: number;
  scoreThreshold?: number;
  filterByDocument?: string[];
}

function generateId(prefix: string): string {
  return `${prefix}_${randomBytes(12).toString('hex')}`;
}

export class KnowledgeBaseService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private db: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private storage: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private embeddingClient: any;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(db: any, storage: any, embeddingClient: any) {
    this.db = db;
    this.storage = storage;
    this.embeddingClient = embeddingClient;
  }

  async createKnowledgeBase(data: {
    userId: string;
    name: string;
    description?: string;
    embeddingModel?: string;
    chunkSize?: number;
    chunkOverlap?: number;
  }): Promise<KnowledgeBase> {
    const id = generateId('kb');
    const now = new Date().toISOString();
    const kb: KnowledgeBase = {
      id,
      user_id: data.userId,
      name: data.name,
      description: data.description,
      embedding_model: data.embeddingModel || 'text-embedding-3-small',
      chunk_size: data.chunkSize || 500,
      chunk_overlap: data.chunkOverlap || 50,
      status: 'active',
      document_count: 0,
      chunk_count: 0,
      created_at: now,
      updated_at: now,
    };

    await this.db.query('knowledge_bases',
      `INSERT INTO knowledge_bases (id, user_id, name, description, embedding_model, chunk_size, chunk_overlap, status, document_count, chunk_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [kb.id, kb.user_id, kb.name, kb.description, kb.embedding_model, kb.chunk_size, kb.chunk_overlap, kb.status, kb.document_count, kb.chunk_count, kb.created_at, kb.updated_at]
    );

    return kb;
  }

  async listKnowledgeBases(userId: string): Promise<KnowledgeBase[]> {
    const result = await this.db.query('knowledge_bases', 'SELECT * FROM knowledge_bases WHERE user_id = ? ORDER BY created_at DESC', [userId]);
    return result.rows;
  }

  async getKnowledgeBase(id: string): Promise<KnowledgeBase | null> {
    const result = await this.db.query('knowledge_bases', 'SELECT * FROM knowledge_bases WHERE id = ?', [id]);
    return result.rows[0] || null;
  }

  async deleteKnowledgeBase(id: string): Promise<void> {
    // Delete all chunks first
    await this.db.query('document_chunks', 'DELETE FROM document_chunks WHERE knowledge_base_id = ?', [id]);
    // Delete all documents
    const docs = await this.db.query('documents', 'SELECT * FROM documents WHERE knowledge_base_id = ?', [id]);
    for (const doc of docs.rows) {
      await this.storage.delete(doc.path);
    }
    await this.db.query('documents', 'DELETE FROM documents WHERE knowledge_base_id = ?', [id]);
    // Delete knowledge base
    await this.db.query('knowledge_bases', 'DELETE FROM knowledge_bases WHERE id = ?', [id]);
  }

  async uploadDocument(kbId: string, userId: string, file: { name: string; data: Buffer; mimeType?: string; size: number }): Promise<Document> {
    const id = generateId('doc');
    const now = new Date().toISOString();
    const ext = file.name.split('.').pop() || 'txt';
    const path = `knowledge-bases/${kbId}/${id}.${ext}`;

    // Upload to storage
    await this.storage.upload(path, file.data, file.size, file.mimeType);

    const doc: Document = {
      id,
      knowledge_base_id: kbId,
      user_id: userId,
      name: file.name,
      type: ext,
      mime_type: file.mimeType,
      size: file.size,
      path,
      status: 'pending',
      chunk_count: 0,
      created_at: now,
      updated_at: now,
    };

    await this.db.query('documents',
      `INSERT INTO documents (id, knowledge_base_id, user_id, name, type, mime_type, size, path, status, chunk_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [doc.id, doc.knowledge_base_id, doc.user_id, doc.name, doc.type, doc.mime_type, doc.size, doc.path, doc.status, doc.chunk_count, doc.created_at, doc.updated_at]
    );

    // Process document asynchronously
    this.processDocument(doc).catch(console.error);

    return doc;
  }

  async listDocuments(kbId: string): Promise<Document[]> {
    const result = await this.db.query('documents', 'SELECT * FROM documents WHERE knowledge_base_id = ? ORDER BY created_at DESC', [kbId]);
    return result.rows;
  }

  async getDocument(id: string): Promise<Document | null> {
    const result = await this.db.query('documents', 'SELECT * FROM documents WHERE id = ?', [id]);
    return result.rows[0] || null;
  }

  async deleteDocument(id: string): Promise<void> {
    const doc = await this.getDocument(id);
    if (!doc) return;

    // Delete chunks
    await this.db.query('document_chunks', 'DELETE FROM document_chunks WHERE document_id = ?', [id]);
    // Delete file from storage
    await this.storage.delete(doc.path);
    // Delete document record
    await this.db.query('documents', 'DELETE FROM documents WHERE id = ?', [id]);
  }

  async search(kbId: string, query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    const topK = options.topK || 5;
    const scoreThreshold = options.scoreThreshold || 0.7;

    // Generate embedding for query
    const queryEmbedding = await this.embeddingClient.embed(query);

    // Get all chunks for this knowledge base
    const result = await this.db.query('document_chunks',
      `SELECT dc.id, dc.content, dc.document_id, dc.chunk_index, dc.metadata, dc.embedding,
              d.name as document_name
       FROM document_chunks dc
       JOIN documents d ON d.id = dc.document_id
       WHERE dc.knowledge_base_id = ?`,
      [kbId]
    );

    // Calculate cosine similarity in JS (SQLite doesn't have pgvector)
    const results: SearchResult[] = [];
    for (const row of result.rows) {
      if (!row.embedding) continue;
      try {
        const embedding = JSON.parse(row.embedding);
        const score = this.cosineSimilarity(queryEmbedding, embedding);
        if (score >= scoreThreshold) {
          results.push({
            id: row.id,
            content: row.content,
            score,
            document_id: row.document_id,
            document_name: row.document_name,
            chunk_index: row.chunk_index,
            metadata: row.metadata,
          });
        }
      } catch {
        // Skip invalid embeddings
      }
    }

    // Sort by score and limit
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topK);
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator === 0 ? 0 : dotProduct / denominator;
  }

  async hybridSearch(kbId: string, query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    const topK = options.topK || 5;

    // Get vector search results
    const vectorResults = await this.search(kbId, query, { ...options, topK: topK * 2 });

    // Get keyword search results
    const keywordResults = await this.keywordSearch(kbId, query, topK * 2);

    // Merge and deduplicate results (RRF - Reciprocal Rank Fusion)
    const scoreMap = new Map<string, number>();

    for (let i = 0; i < vectorResults.length; i++) {
      const id = vectorResults[i].id;
      const score = 1.0 / (60 + i + 1); // RRF score
      scoreMap.set(id, (scoreMap.get(id) || 0) + score * 0.7); // Weight: 70% vector
    }

    for (let i = 0; i < keywordResults.length; i++) {
      const id = keywordResults[i].id;
      const score = 1.0 / (60 + i + 1);
      scoreMap.set(id, (scoreMap.get(id) || 0) + score * 0.3); // Weight: 30% keyword
    }

    // Sort by combined score
    const allResults = [...vectorResults, ...keywordResults];
    const seen = new Set<string>();
    const merged: SearchResult[] = [];

    for (const result of allResults) {
      if (!seen.has(result.id)) {
        seen.add(result.id);
        result.score = scoreMap.get(result.id) || 0;
        merged.push(result);
      }
    }

    merged.sort((a, b) => b.score - a.score);
    return merged.slice(0, topK);
  }

  private async keywordSearch(kbId: string, query: string, limit: number): Promise<SearchResult[]> {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (terms.length === 0) return [];

    // Use LOWER() for case-insensitive matching in SQLite
    const likeConditions = terms.map(() => `LOWER(dc.content) LIKE ?`).join(' OR ');
    const likeParams = terms.map(t => `%${t.toLowerCase()}%`);

    const sql = `
      SELECT dc.id, dc.content, dc.document_id, dc.chunk_index, dc.metadata,
             d.name as document_name,
             0.5 as score
      FROM document_chunks dc
      JOIN documents d ON d.id = dc.document_id
      WHERE dc.knowledge_base_id = ? AND (${likeConditions})
      LIMIT ?
    `;

    const result = await this.db.query('document_chunks', sql, [kbId, ...likeParams, limit]);
    return result.rows.map((row: any) => ({
      id: row.id,
      content: row.content,
      score: row.score,
      document_id: row.document_id,
      document_name: row.document_name,
      chunk_index: row.chunk_index,
      metadata: row.metadata,
    }));
  }

  private async processDocument(doc: Document): Promise<void> {
    try {
      // Update status to indexing
      await this.db.query('documents', 'UPDATE documents SET status = ?, updated_at = ? WHERE id = ?', ['indexing', new Date().toISOString(), doc.id]);

      // Download file from storage
      const fileData = await this.storage.download(doc.path);

      // Extract text based on file type
      const text = await this.extractText(fileData, doc.type);

      // Chunk the text
      const chunks = this.chunkText(text, 500, 50);

      // Generate embeddings and store chunks
      for (let i = 0; i < chunks.length; i++) {
        const chunkId = generateId('chunk');
        const embedding = await this.embeddingClient.embed(chunks[i]);

        await this.db.query('document_chunks',
          `INSERT INTO document_chunks (id, document_id, knowledge_base_id, content, chunk_index, token_count, embedding, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [chunkId, doc.id, doc.knowledge_base_id, chunks[i], i, this.estimateTokens(chunks[i]), JSON.stringify(embedding), new Date().toISOString()]
        );
      }

      // Update document status
      await this.db.query('documents',
        'UPDATE documents SET status = ?, chunk_count = ?, updated_at = ? WHERE id = ?',
        ['indexed', chunks.length, new Date().toISOString(), doc.id]
      );

      // Update knowledge base counts
      await this.db.query('knowledge_bases',
        'UPDATE knowledge_bases SET document_count = document_count + 1, chunk_count = chunk_count + ?, updated_at = ? WHERE id = ?',
        [chunks.length, new Date().toISOString(), doc.knowledge_base_id]
      );

    } catch (error) {
      await this.db.query('documents',
        'UPDATE documents SET status = ?, error_message = ?, updated_at = ? WHERE id = ?',
        ['failed', error instanceof Error ? error.message : String(error), new Date().toISOString(), doc.id]
      );
    }
  }

  private async extractText(data: Buffer, type: string): Promise<string> {
    const typeLower = type.toLowerCase();

    switch (typeLower) {
      case 'txt':
      case 'md':
      case 'markdown':
      case 'json':
      case 'csv':
      case 'html':
      case 'xml':
      case 'js':
      case 'ts':
      case 'py':
        return data.toString('utf8');

      case 'pdf':
        return this.extractPdfText(data);

      case 'docx':
      case 'doc':
        return this.extractDocxText(data);

      case 'xlsx':
      case 'xls':
        return this.extractExcelText(data);

      default:
        // Try to extract as text
        return data.toString('utf8');
    }
  }

  private async extractPdfText(data: Buffer): Promise<string> {
    try {
      // Dynamic import to avoid loading if not needed
      const pdfParse = await import('pdf-parse');
      const result = await pdfParse.default(data);
      return result.text;
    } catch (error) {
      console.error('PDF extraction failed:', error);
      return `[PDF extraction failed for file]`;
    }
  }

  private async extractDocxText(data: Buffer): Promise<string> {
    try {
      const mammoth = await import('mammoth');
      const result = await mammoth.extractRawText({ buffer: data });
      return result.value;
    } catch (error) {
      console.error('DOCX extraction failed:', error);
      return `[DOCX extraction failed for file]`;
    }
  }

  private async extractExcelText(data: Buffer): Promise<string> {
    try {
      const xlsx = await import('xlsx');
      const workbook = xlsx.read(data, { type: 'buffer' });
      const texts: string[] = [];
      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        const jsonData = xlsx.utils.sheet_to_json(sheet, { header: 1 });
        for (const row of jsonData) {
          if (Array.isArray(row)) {
            texts.push(row.filter(cell => cell != null).join(' '));
          }
        }
      }
      return texts.join('\n');
    } catch (error) {
      console.error('Excel extraction failed:', error);
      return `[Excel extraction failed for file]`;
    }
  }

  private chunkText(text: string, chunkSize: number, chunkOverlap: number): string[] {
    const chunks: string[] = [];
    const sentences = text.split(/[.!?。！？\n]+/).filter(s => s.trim().length > 0);

    let currentChunk = '';
    for (const sentence of sentences) {
      const trimmed = sentence.trim();
      if (currentChunk.length + trimmed.length > chunkSize && currentChunk.length > 0) {
        chunks.push(currentChunk.trim());
        // Keep overlap
        const overlapText = currentChunk.slice(-chunkOverlap);
        currentChunk = overlapText + ' ' + trimmed;
      } else {
        currentChunk += (currentChunk ? ' ' : '') + trimmed;
      }
    }

    if (currentChunk.trim().length > 0) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  }

  private estimateTokens(text: string): number {
    // Rough estimate: ~4 characters per token
    return Math.ceil(text.length / 4);
  }
}
