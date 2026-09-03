import type { FastifyInstance } from 'fastify';

export interface KnowledgeRouteDeps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  knowledgeService?: any;
}

export function registerKnowledgeRoutes(server: FastifyInstance, deps: KnowledgeRouteDeps): void {
  const { knowledgeService } = deps;

  // POST /api/v1/knowledge-bases - Create knowledge base
  server.post('/api/v1/knowledge-bases', async (req, res) => {
    if (!knowledgeService) {
      return res.code(503).send({ error: 'Knowledge base service is unavailable. Please check storage configuration.' });
    }
    try {
      const userId = (req as any).userId || 'default';
      const { name, description, embeddingModel, chunkSize, chunkOverlap } = req.body as any;

      if (!name) {
        return res.code(400).send({ error: 'Name is required' });
      }

      const kb = await knowledgeService.createKnowledgeBase({
        userId,
        name,
        description,
        embeddingModel,
        chunkSize,
        chunkOverlap,
      });

      return res.code(201).send(kb);
    } catch (error) {
      req.log.error({ error }, 'Create knowledge base failed');
      return res.code(500).send({ error: 'Internal server error' });
    }
  });

  // GET /api/v1/knowledge-bases - List knowledge bases
  server.get('/api/v1/knowledge-bases', async (req, res) => {
    if (!knowledgeService) {
      return res.code(503).send({ error: 'Knowledge base service is unavailable. Please check storage configuration.' });
    }
    try {
      const userId = (req as any).userId || 'default';
      const kbs = await knowledgeService.listKnowledgeBases(userId);
      return res.send(kbs);
    } catch (error) {
      req.log.error({ error }, 'List knowledge bases failed');
      return res.code(500).send({ error: 'Internal server error' });
    }
  });

  // GET /api/v1/knowledge-bases/:kbId - Get knowledge base details
  server.get('/api/v1/knowledge-bases/:kbId', async (req, res) => {
    try {
      const { kbId } = req.params as { kbId: string };
      const kb = await knowledgeService.getKnowledgeBase(kbId);
      if (!kb) {
        return res.code(404).send({ error: 'Knowledge base not found' });
      }
      return res.send(kb);
    } catch (error) {
      req.log.error({ error }, 'Get knowledge base failed');
      return res.code(500).send({ error: 'Internal server error' });
    }
  });

  // DELETE /api/v1/knowledge-bases/:kbId - Delete knowledge base
  server.delete('/api/v1/knowledge-bases/:kbId', async (req, res) => {
    try {
      const { kbId } = req.params as { kbId: string };
      await knowledgeService.deleteKnowledgeBase(kbId);
      return res.send({ message: 'Knowledge base deleted' });
    } catch (error) {
      req.log.error({ error }, 'Delete knowledge base failed');
      return res.code(500).send({ error: 'Internal server error' });
    }
  });

  // POST /api/v1/knowledge-bases/:kbId/documents - Upload document
  // Supports both multipart/form-data (preferred for large files) and JSON with base64.
  server.post('/api/v1/knowledge-bases/:kbId/documents', async (req, res) => {
    try {
      const { kbId } = req.params as { kbId: string };
      const userId = (req as any).userId || 'default';

      let fileName: string | undefined;
      let buffer: Buffer | undefined;
      let mimeType: string | undefined;

      // Try multipart first
      if (req.isMultipart()) {
        const file = await req.file();
        if (file) {
          fileName = file.filename;
          buffer = await file.toBuffer();
          mimeType = file.mimetype;
        }
      } else {
        // Fallback to JSON with base64
        const body = req.body as any;
        fileName = body?.fileName;
        mimeType = body?.mimeType;
        if (body?.fileData) {
          buffer = Buffer.from(body.fileData, 'base64');
        }
      }

      if (!fileName || !buffer) {
        return res.code(400).send({ error: 'fileName and fileData (or multipart file) are required' });
      }

      const doc = await knowledgeService.uploadDocument(kbId, userId, {
        name: fileName,
        data: buffer,
        mimeType,
        size: buffer.length,
      });

      return res.code(201).send(doc);
    } catch (error) {
      req.log.error({ error }, 'Upload document failed');
      return res.code(500).send({ error: 'Internal server error' });
    }
  });

  // GET /api/v1/knowledge-bases/:kbId/documents - List documents
  server.get('/api/v1/knowledge-bases/:kbId/documents', async (req, res) => {
    try {
      const { kbId } = req.params as { kbId: string };
      const docs = await knowledgeService.listDocuments(kbId);
      return res.send(docs);
    } catch (error) {
      req.log.error({ error }, 'List documents failed');
      return res.code(500).send({ error: 'Internal server error' });
    }
  });

  // DELETE /api/v1/knowledge-bases/:kbId/documents/:docId - Delete document
  server.delete('/api/v1/knowledge-bases/:kbId/documents/:docId', async (req, res) => {
    try {
      const { docId } = req.params as { docId: string };
      await knowledgeService.deleteDocument(docId);
      return res.send({ message: 'Document deleted' });
    } catch (error) {
      req.log.error({ error }, 'Delete document failed');
      return res.code(500).send({ error: 'Internal server error' });
    }
  });

  // POST /api/v1/knowledge-bases/:kbId/search - Search knowledge base
  server.post('/api/v1/knowledge-bases/:kbId/search', async (req, res) => {
    try {
      const { kbId } = req.params as { kbId: string };
      const { query, topK, scoreThreshold, hybrid } = req.body as any;

      if (!query) {
        return res.code(400).send({ error: 'Query is required' });
      }

      let results;
      if (hybrid) {
        results = await knowledgeService.hybridSearch(kbId, query, { topK, scoreThreshold });
      } else {
        results = await knowledgeService.search(kbId, query, { topK, scoreThreshold });
      }

      return res.send(results);
    } catch (error) {
      req.log.error({ error }, 'Search failed');
      return res.code(500).send({ error: 'Internal server error' });
    }
  });
}
