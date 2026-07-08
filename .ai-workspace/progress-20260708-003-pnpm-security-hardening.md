**開始:** 2026-07-08 / **推定工数:** 3-4h / **優先度:** 中
**担当:** AI（Claude Code） / **セッション:** 継続

参照:
- 計画: `.ai-workspace/20260708-003-pnpm-security-hardening-plan.md`（ステータス: PM レビュー版）
- 関連: CLAUDE.md / `.ai-workspace/000-ai-progress-management-guide.mdc` / `.ai-workspace/20260708-002-sustained-tone-synthesis-quality-proposal.md`（この計画の動機となった fft.js 導入検討。fft.js 導入自体は別スコープ）

---

## フェーズ進捗

- P1: ローカル移行（packageManager/minimumReleaseAge 設定 → lockfile 生成 → allowlist 実測 → 各種ローカル検証、計画書ステップ1-6） [未着手]
- P2: CI ワークフロー更新 + ドキュメント更新（同一ブランチ・同一PR。ci.yml/ci-smoke.yml/deploy-pages.yml の pnpm 化、Dependabot、OSV-Scanner、CLAUDE.md/README.md 更新、PR作成・グリーン確認、計画書ステップ7-12） [未着手]
- P3: 統合検証（ブラウザ実地確認 → マージ → Deploy/週次OSV グリーン確認 → 進捗ログ更新、計画書ステップ13-15） [未着手]

---

## 本日の作業（時系列）

（実装開始後、ステップ完了ごとに追記）

---

## 検証チェックリスト（計画書 3章「完了基準」より転記）

- [ ] `pnpm-lock.yaml` がコミットされ、`package-lock.json` が削除されている
- [ ] `package.json` に `packageManager` / `pnpm.minimumReleaseAge` / （必要な場合）`pnpm.onlyBuiltDependencies` が設定されている
- [ ] 新規追加のサードパーティ Action（`pnpm/action-setup`、`google/osv-scanner-action`）がコミット SHA で固定されている
- [ ] `.github/dependabot.yml`（github-actions のみ。npm エコシステムは延期）が追加されている
- [ ] 既存 CI ワークフロー3本（`deploy-pages.yml` 含む）が `pnpm install --frozen-lockfile` を使用し、初回 push でグリーンになる
- [ ] OSV-Scanner のワークフロー（PR差分・週次フルスキャン、別ファイル、permissions 最小化）が追加され、初回実行が成功する（既存依存に脆弱性がヒットした場合は `osv-scanner.toml` のトリアージを経て成功）
- [ ] CLAUDE.md / README.md のコマンド記載が pnpm に統一され、記載通りに実際に動く。CLAUDE.md にサプライチェーンセキュリティ方針の記載がある
- [ ] 主要ワークフロー（初期化 → 録音 → 周波解析 → 合成再生 → 原音との比較）がブラウザ実地で通り、コンソールエラーなし
- [ ] `pnpm run typecheck` / `lint` / `format:check` / `test` / `test:e2e` / `build` が全てエラーなく完了する
- [ ] 進捗ログ更新済み

---

## 品質保証チェックリスト

### コード品質
- [ ] `pnpm run typecheck`（strict, allowJs off）エラーゼロ
- [ ] `pnpm run lint` エラーゼロ
- [ ] `pnpm run format:check` エラーゼロ

### 動作品質
- [ ] `pnpm test`（Vitest、32 tests）全グリーン
- [ ] `pnpm run test:e2e`（Playwright）全グリーン（ローカルで3回連続実行、既存の実施パターンに合わせる）
- [ ] `pnpm run build` 成功
- [ ] ブラウザ実地確認（初期化 → 録音 → 音声再生 → 周波解析 → 成分選択 → 合成再生 → 原音との比較）でコンソールエラーなし
- [ ] GitHub Actions: CI / CI Smoke / OSV-Scanner(PR差分) が PR 上でグリーン
- [ ] GitHub Actions: マージ後、Deploy to GitHub Pages / OSV-Scanner(週次) が初回グリーン
- [ ] ライブサイト（https://masnak.github.io/waveVisualizer/）が pnpm 化後も正常稼働

### 記録品質
- [ ] 既知バグ・意図的な運用判断（Dependabot npm 延期、deploy-pages 事前検証省略、週次 OSV hard-fail 維持等）が本ファイルまたは計画書に記録済み
- [ ] コミット履歴を本ファイルに記録

---

## 問題・エラー記録

（発生次第追記）

---

## 仕様決定（結論 + 根拠を残す。計画書 1章と同期）

- **決定**: パッケージマネージャを npm → pnpm へ移行。frozen-lockfile・ライフサイクルスクリプトの既定ブロック（実測 allowlist 化）・OSV-Scanner（PR差分+週次、両方 hard-fail）を導入
- **根拠（要点）**:
  - 堅牢: lockfile の frozen 強制、既定 deny（オプトイン許可制）による事故りにくさ
  - セキュア: サプライチェーン攻撃対策そのものが目的。`minimumReleaseAge` で悪意ある新規公開パッケージにも対応
  - 明快: pnpm 公式推奨構成（`pnpm/action-setup`）に極力従う
  - 修正容易: ロールバック手順明記（git revert で npm に即座に戻せる、deploy は build 失敗時も本番を保護）
- **対案（あった場合）**:
  - npm 単体ハードニング（`.npmrc` の `ignore-scripts=true`）は却下。allowlist 運用ができないため
  - Dependabot npm エコシステム・deploy-pages workflow_dispatch 事前検証は、PM 精査でこの規模には過剰と判断され延期/省略

詳細な意思決定プロセス（Phase 2〜5 の全経緯）は計画書 `20260708-003-pnpm-security-hardening-plan.md` の「レビュー履歴」節を参照。

---

## 最終更新

**最終更新:** 2026-07-08（計画確定、最終版。Phase 3・Phase 6 で Security Engineer / DevOps Automator / Software Architect の計6回のレビュー、Phase 5 で PM 精査を経て承認待ち。実装未着手）
