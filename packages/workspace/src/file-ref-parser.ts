export interface FileReference {
  original: string;
  path: string;
  type: 'file' | 'line' | 'range';
}

export interface ParsedMessage {
  text: string;
  fileRefs: FileReference[];
}

export class FileReferenceParser {
  private static patterns = [
    // Match @filepath.ext or filepath.ext
    /(?:^|\s)([@＠]?[\w/-]+?\.(?:html|css|js|ts|jsx|tsx|json|md|txt|py|java|cpp|c|h|go|rs|yaml|yml|toml))(?:\s|$|[,.!?;：。，！？；])/gi,
    // Match @filename or @path/to/file without requiring extension
    /(?:^|\s)([@＠][\w/-]+?)(?=\s|$|[,.!?;：。，！？；])/gi,
    // Match "file X" or "文件 X"
    /(?:文件|file)\s+([\w/\-.]+?)(?:\s|$|[,.!?;：。，！？；])/gi,
    // Match quotes around filenames
    /"([^"]+?\.(?:html|css|js|ts|jsx|tsx|json|md|txt|py|java|cpp|c|h|go|rs|yaml|yml|toml))"/gi,
  ];

  static parse(text: string): ParsedMessage {
    const fileRefs: FileReference[] = [];
    const cleanedText = text;

    for (const pattern of this.patterns) {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        const original = match[0].trim();
        let path = match[1] || match[0].trim();
        
        // Strip leading @ symbol if present
        if (path.startsWith('@') || path.startsWith('＠')) {
          path = path.slice(1);
        }
        
        // Avoid duplicates
        if (!fileRefs.some(ref => ref.path === path)) {
          fileRefs.push({
            original,
            path,
            type: 'file'
          });
        }
      }
    }

    return {
      text: cleanedText,
      fileRefs
    };
  }

  static extractFilePaths(text: string): string[] {
    const parsed = this.parse(text);
    return parsed.fileRefs.map(ref => ref.path);
  }
}
