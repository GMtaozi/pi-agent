const js = require('@eslint/js');
const tseslint = require('typescript-eslint');

module.exports = [
  {
    // 只检查 TypeScript 源码；排除产物、依赖与打包文件
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      'vendor/**',
      '**/*.cjs',
      '**/*.js',
      '**/*.d.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['apps/**/*.{ts,tsx}', 'packages/**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    rules: {
      // 项目门禁三原则
      '@typescript-eslint/no-explicit-any': 'error',
      'eqeqeq': ['error', 'always', { null: 'ignore' }],
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrors: 'none',
      }],
      // 空的防御性 catch 块允许
      'no-empty': ['error', { allowEmptyCatch: true }],
      // 噪音过大且非本门禁关注点（测试中大量合法表达式语句）
      '@typescript-eslint/no-unused-expressions': 'off',
    },
  },
];
