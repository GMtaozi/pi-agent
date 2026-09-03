import { describe, it, expect, beforeEach, vi } from 'vitest';
import { KnowledgeBaseService } from '../src/knowledge-service';

const createMockDb = () => ({ query: vi.fn() });
const createMockStorage = () => ({ upload: vi.fn(), delete: vi.fn(), download: vi.fn() });
const createMockEmbeddingClient = () => ({ embed: vi.fn().mockResolvedValue(new Array(1536).fill(0.1)) });

describe('KnowledgeBaseService', () => {
  let db: ReturnType<typeof createMockDb>;
  let storage: ReturnType<typeof createMockStorage>;
  let embeddingClient: ReturnType<typeof createMockEmbeddingClient>;
  let service: KnowledgeBaseService;

  beforeEach(() => {
    db = createMockDb();
    storage = createMockStorage();
    embeddingClient = createMockEmbeddingClient();
    service = new KnowledgeBaseService(db, storage, embeddingClient);
  });

  describe('createKnowledgeBase', () => {
    it('should create knowledge base', async () => {
      db.query.mockResolvedValue({ rows: [] });
      const kb = await service.createKnowledgeBase({
        userId: 'user_1',
        name: 'Test KB',
        description: 'Test description',
      });

      expect(kb.id).toMatch(/^kb_/);
      expect(kb.name).toBe('Test KB');
      expect(kb.status).toBe('active');
      expect(kb.embedding_model).toBe('text-embedding-3-small');
    });

    it('should use custom embedding model', async () => {
      db.query.mockResolvedValue({ rows: [] });
      const kb = await service.createKnowledgeBase({
        userId: 'user_1',
        name: 'Test KB',
        embeddingModel: 'custom-model',
      });

      expect(kb.embedding_model).toBe('custom-model');
    });
  });

  describe('listKnowledgeBases', () => {
    it('should list knowledge bases', async () => {
      const rows = [{ id: 'kb_1', name: 'KB 1' }, { id: 'kb_2', name: 'KB 2' }];
      db.query.mockResolvedValue({ rows });

      const kbs = await service.listKnowledgeBases('user_1');
      expect(kbs).toHaveLength(2);
    });
  });

  describe('getKnowledgeBase', () => {
    it('should get knowledge base by id', async () => {
      db.query.mockResolvedValue({ rows: [{ id: 'kb_1', name: 'KB 1' }] });

      const kb = await service.getKnowledgeBase('kb_1');
      expect(kb).not.toBeNull();
      expect(kb?.id).toBe('kb_1');
    });

    it('should return null for non-existent kb', async () => {
      db.query.mockResolvedValue({ rows: [] });

      const kb = await service.getKnowledgeBase('nonexistent');
      expect(kb).toBeNull();
    });
  });

  describe('uploadDocument', () => {
    it('should upload document', async () => {
      db.query.mockResolvedValue({ rows: [] });
      storage.upload.mockResolvedValue(undefined);

      const doc = await service.uploadDocument('kb_1', 'user_1', {
        name: 'test.pdf',
        data: Buffer.from('test content'),
        mimeType: 'application/pdf',
        size: 100,
      });

      expect(doc.id).toMatch(/^doc_/);
      expect(doc.name).toBe('test.pdf');
      expect(doc.type).toBe('pdf');
      expect(doc.status).toBe('pending');
      expect(storage.upload).toHaveBeenCalled();
    });
  });

  describe('listDocuments', () => {
    it('should list documents', async () => {
      const rows = [{ id: 'doc_1', name: 'Doc 1' }];
      db.query.mockResolvedValue({ rows });

      const docs = await service.listDocuments('kb_1');
      expect(docs).toHaveLength(1);
    });
  });

  describe('search', () => {
    it('should search documents', async () => {
      db.query.mockResolvedValue({ rows: [] });
      embeddingClient.embed.mockResolvedValue(new Array(1536).fill(0.1));

      const results = await service.search('kb_1', 'test query');
      expect(results).toEqual([]);
    });
  });

  describe('deleteDocument', () => {
    it('should delete document', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ id: 'doc_1', path: 'test.pdf' }] });
      db.query.mockResolvedValue({ rows: [] });
      storage.delete.mockResolvedValue(undefined);

      await service.deleteDocument('doc_1');
      expect(storage.delete).toHaveBeenCalledWith('test.pdf');
    });
  });
});
