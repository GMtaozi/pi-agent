import { readdir, readFile } from 'fs/promises';
import { join } from 'path';

const PACKAGES_DIR = join(process.cwd(), 'packages');

async function checkPackageIndexes() {
  const packages = await readdir(PACKAGES_DIR);
  const issues: string[] = [];

  for (const pkg of packages) {
    const srcDir = join(PACKAGES_DIR, pkg, 'src');
    const indexPath = join(srcDir, 'index.ts');

    try {
      await readFile(indexPath);
    } catch {
      continue;
    }

    const indexContent = await readFile(indexPath, 'utf-8');
    const indexLines = indexContent.split(/\r?\n/);

    for (const line of indexLines) {
      const exportMatch = line.match(/^export\s+\{([^}]+)\}\s+from\s+'([^']+)'/);
      if (!exportMatch) continue;

      const exportedNames = exportMatch[1].split(',').map((s) => s.trim()).filter(Boolean);
      const sourcePath = join(srcDir, exportMatch[2]);

      let sourceContent: string;
      try {
        sourceContent = await readFile(sourcePath, 'utf-8');
      } catch {
        continue;
      }

      for (const name of exportedNames) {
        const regex = new RegExp(`^(export\\s+)?(interface|type)\\s+\\b${name}\\b`);
        if (regex.test(sourceContent)) {
          issues.push(`${pkg}/src/index.ts: ${name} is interface/type but exported as value from ${exportMatch[2]}`);
        }
      }
    }
  }

  if (issues.length === 0) {
    console.log('No interface/type re-export issues found.');
  } else {
    console.log('Found issues:');
    for (const issue of issues) {
      console.log(`  - ${issue}`);
    }
    process.exit(1);
  }
}

checkPackageIndexes().catch((err) => {
  console.error(err);
  process.exit(1);
});
