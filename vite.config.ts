import { defineConfig } from 'vite';

// base はプロダクションビルド時のみ '/waveVisualizer/'（GitHub Pages のプロジェクトページ
// サブパス配信、計画 1.4-G）。dev server は E2E の baseURL（localhost:8000 直下）を
// 変えないよう '/' のまま維持する。
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/waveVisualizer/' : '/',
  server: {
    port: 8000,
  },
}));
