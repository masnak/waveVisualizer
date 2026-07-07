// ESLint flat config。scope 分離: レガシー classic script の .js は
// sourceType:'script' + 最小ルールのみ（未定義グローバル検出は tsc に委ねる。
// 計画 1.4 / .ai-workspace/20260707-001-ts-tdd-test-infra-plan.md 参照）。
// 新規の .ts は typescript-eslint recommended を適用し `--max-warnings=0` で厳格化する。
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
    ],
  },
  {
    // レガシー classic script（M2-8 で src/ へ移設・.ts 化されるまでの暫定スコープ）
    files: ['main.js', 'waveVisualizer.js', 'spectrumVisualizer.js', 'sinewaveAnalyser.js'],
    languageOptions: {
      sourceType: 'script',
      ecmaVersion: 2022,
    },
    rules: {
      'no-redeclare': 'error',
      'no-dupe-keys': 'error',
      'no-unreachable': 'error',
    },
  },
  {
    files: ['**/*.ts'],
    extends: [tseslint.configs.recommended],
    rules: {
      '@typescript-eslint/no-unused-vars': 'warn',
    },
  },
  eslintConfigPrettier,
);
