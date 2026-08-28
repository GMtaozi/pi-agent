const fs = require('fs');
const path = 'D:\\Project\\pi-agent\\apps\\server\\src\\routes\\models.ts';
let c = fs.readFileSync(path, 'utf8');

// Fix 1: Reduce timeout from 30s to 10s
c = c.replace(
  'const timeout = setTimeout(() => controller.abort(), 30000);',
  'const timeout = setTimeout(() => controller.abort(), 10000);'
);

// Fix 2: Reduce candidate paths - only try the most likely one based on baseURL
const oldPaths = `      // 尝试多个可能的 models 路径（不同 provider 的路径结构不同）
      // 例如 LongCat: /api/v1/models 和 /api/models 都可能
      const candidatePaths = [
        \`\${normalizedBase}/models\`,
        \`\${normalizedBase}/v1/models\`,
      ];
      // 如果 baseURL 以 /v1 结尾，也尝试去掉 /v1 的路径
      if (normalizedBase.endsWith('/v1')) {
        const baseWithoutV1 = normalizedBase.slice(0, -3);
        candidatePaths.push(\`\${baseWithoutV1}/models\`);
      }`;

const newPaths = `      // 根据 baseURL 智能选择 models 路径
      const candidatePaths = [];
      if (normalizedBase.endsWith('/v1')) {
        candidatePaths.push(\`\${normalizedBase}/models\`);
      } else if (normalizedBase.endsWith('/openai')) {
        candidatePaths.push(\`\${normalizedBase}/v1/models\`);
      } else {
        candidatePaths.push(\`\${normalizedBase}/models\`);
        candidatePaths.push(\`\${normalizedBase}/v1/models\`);
      }`;

if (c.includes(oldPaths)) {
  c = c.replace(oldPaths, newPaths);
  console.log('Fixed: Reduced timeout and optimized path selection');
} else {
  console.log('Pattern not found, trying simpler fix');
}

fs.writeFileSync(path, c, 'utf8');
