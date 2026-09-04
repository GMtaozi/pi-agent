import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryService } from '../src/memory';

describe('MemoryService', () => {
  let service: MemoryService;

  beforeEach(() => {
    service = new MemoryService();
  });

  describe('addEntry', () => {
    it('should add entry with generated id and timestamp', () => {
      const entry = service.addEntry({ text: 'Hello world', tags: ['greeting'] });
      expect(entry.id).toMatch(/^m-/);
      expect(entry.text).toBe('Hello world');
      expect(entry.tags).toEqual(['greeting']);
      expect(entry.ts).toBeDefined();
    });

    it('should list all entries', () => {
      service.addEntry({ text: 'Entry 1', tags: ['a'] });
      service.addEntry({ text: 'Entry 2', tags: ['b'] });
      expect(service.listEntries()).toHaveLength(2);
    });
  });

  describe('search', () => {
    it('should find entries by text content', () => {
      service.addEntry({ text: 'The quick brown fox', tags: [] });
      service.addEntry({ text: 'Lazy dog sleeps', tags: [] });

      const results = service.search('fox');
      expect(results).toHaveLength(1);
      expect(results[0].text).toContain('fox');
    });

    it('should find entries by tag', () => {
      service.addEntry({ text: 'Memory A', tags: ['work'] });
      service.addEntry({ text: 'Memory B', tags: ['personal'] });

      const results = service.search('work');
      expect(results).toHaveLength(1);
    });

    it('should handle multiple search terms', () => {
      service.addEntry({ text: 'Quick brown fox', tags: [] });
      service.addEntry({ text: 'Lazy dog', tags: [] });

      const results = service.search('fox dog');
      expect(results.length).toBeGreaterThanOrEqual(2);
    });

    it('should return empty for no matches', () => {
      service.addEntry({ text: 'Hello world', tags: [] });
      expect(service.search('nonexistent')).toEqual([]);
    });

    it('should return empty for empty query', () => {
      service.addEntry({ text: 'Hello world', tags: [] });
      expect(service.search('')).toEqual([]);
      expect(service.search('   ')).toEqual([]);
    });
  });

  describe('updateEntry', () => {
    it('should update entry text', () => {
      const entry = service.addEntry({ text: 'Original', tags: [] });
      const result = service.updateEntry(entry.id, { text: 'Updated' });

      expect(result).toBe(true);
      const updated = service.listEntries().find(e => e.id === entry.id);
      expect(updated?.text).toBe('Updated');
    });

    it('should update entry tags', () => {
      const entry = service.addEntry({ text: 'Hello', tags: ['old'] });
      const result = service.updateEntry(entry.id, { tags: ['new'] });

      expect(result).toBe(true);
      const updated = service.listEntries().find(e => e.id === entry.id);
      expect(updated?.tags).toEqual(['new']);
    });

    it('should return false for non-existent entry', () => {
      const result = service.updateEntry('nonexistent', { text: 'test' });
      expect(result).toBe(false);
    });

    it('should update search index on text change', () => {
      const entry = service.addEntry({ text: 'fox', tags: [] });
      service.updateEntry(entry.id, { text: 'dog' });

      const foxResults = service.search('fox');
      const dogResults = service.search('dog');
      expect(foxResults).toEqual([]);
      expect(dogResults).toHaveLength(1);
    });
  });

  describe('deleteEntry', () => {
    it('should delete entry', () => {
      const entry = service.addEntry({ text: 'Hello', tags: [] });
      const result = service.deleteEntry(entry.id);

      expect(result).toBe(true);
      expect(service.listEntries()).toEqual([]);
    });

    it('should return false for non-existent entry', () => {
      const result = service.deleteEntry('nonexistent');
      expect(result).toBe(false);
    });

    it('should remove entry from search index', () => {
      const entry = service.addEntry({ text: 'fox', tags: [] });
      service.deleteEntry(entry.id);

      expect(service.search('fox')).toEqual([]);
    });
  });

  describe('getIndexStats', () => {
    it('should return index stats', () => {
      service.addEntry({ text: 'Hello world', tags: ['greeting'] });
      const stats = service.getIndexStats();

      expect(stats.totalEntries).toBe(1);
      expect(stats.textIndexSize).toBeGreaterThan(0);
      expect(stats.tagIndexSize).toBe(1);
    });
  });
});
