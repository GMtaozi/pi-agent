export interface MemoryEntry {
  id: string;
  text: string;
  tags: string[];
  ts: number;
}

export interface MemoryStore {
  workspace: string;
  entries: MemoryEntry[];
}

export class MemoryService {
  private store: MemoryStore = { workspace: 'default', entries: [] };
  private textIndex = new Map<string, Set<string>>(); // word -> entry ids
  private tagIndex = new Map<string, Set<string>>(); // tag -> entry ids

  addEntry(entry: Omit<MemoryEntry, 'id' | 'ts'>): MemoryEntry {
    const newEntry: MemoryEntry = {
      id: 'm-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
      ts: Date.now(),
      ...entry
    };
    this.store.entries.push(newEntry);
    this.indexEntry(newEntry);
    return newEntry;
  }

  listEntries(): MemoryEntry[] {
    return [...this.store.entries];
  }

  search(query: string): MemoryEntry[] {
    const queryLower = query.toLowerCase();
    const queryTerms = queryLower.split(/\s+/).filter(Boolean);
    
    if (queryTerms.length === 0) return [];
    
    // Find entries that match any query term
    const matchedIds = new Set<string>();
    
    for (const term of queryTerms) {
      // Check text index
      for (const [word, ids] of this.textIndex) {
        if (word.includes(term)) {
          for (const id of ids) {
            matchedIds.add(id);
          }
        }
      }
      
      // Check tag index
      const tagIds = this.tagIndex.get(term);
      if (tagIds) {
        for (const id of tagIds) {
          matchedIds.add(id);
        }
      }
    }
    
    // Return matched entries
    return this.store.entries.filter(e => matchedIds.has(e.id));
  }

  updateEntry(id: string, updates: { text?: string; tags?: string[] }): boolean {
    const index = this.store.entries.findIndex(e => e.id === id);
    if (index === -1) return false;
    
    const entry = this.store.entries[index];
    this.removeFromIndex(entry);
    
    if (updates.text !== undefined) entry.text = updates.text;
    if (updates.tags !== undefined) entry.tags = updates.tags;
    
    this.indexEntry(entry);
    return true;
  }

  deleteEntry(id: string): boolean {
    const index = this.store.entries.findIndex(e => e.id === id);
    if (index === -1) return false;
    
    const entry = this.store.entries[index];
    this.removeFromIndex(entry);
    this.store.entries.splice(index, 1);
    return true;
  }

  private indexEntry(entry: MemoryEntry): void {
    // Index text words
    const words = entry.text.toLowerCase().split(/\s+/).filter(Boolean);
    for (const word of words) {
      if (!this.textIndex.has(word)) {
        this.textIndex.set(word, new Set());
      }
      this.textIndex.get(word)!.add(entry.id);
    }
    
    // Index tags
    for (const tag of entry.tags) {
      if (!this.tagIndex.has(tag)) {
        this.tagIndex.set(tag, new Set());
      }
      this.tagIndex.get(tag)!.add(entry.id);
    }
  }

  private removeFromIndex(entry: MemoryEntry): void {
    // Remove from text index
    const words = entry.text.toLowerCase().split(/\s+/).filter(Boolean);
    for (const word of words) {
      const ids = this.textIndex.get(word);
      if (ids) {
        ids.delete(entry.id);
        if (ids.size === 0) {
          this.textIndex.delete(word);
        }
      }
    }
    
    // Remove from tag index
    for (const tag of entry.tags) {
      const ids = this.tagIndex.get(tag);
      if (ids) {
        ids.delete(entry.id);
        if (ids.size === 0) {
          this.tagIndex.delete(tag);
        }
      }
    }
  }

  getIndexStats() {
    return {
      textIndexSize: this.textIndex.size,
      tagIndexSize: this.tagIndex.size,
      totalEntries: this.store.entries.length
    };
  }
}
