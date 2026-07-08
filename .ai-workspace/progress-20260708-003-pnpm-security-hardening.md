**開始:** 2026-07-08 / **推定工数:** 3-4h / **優先度:** 中
**担当:** AI（Claude Code） / **セッション:** 継続

参照:
- 計画: `.ai-workspace/20260708-003-pnpm-security-hardening-plan.md`（ステータス: PM レビュー版）
- 関連: CLAUDE.md / `.ai-workspace/000-ai-progress-management-guide.mdc` / `.ai-workspace/20260708-002-sustained-tone-synthesis-quality-proposal.md`（この計画の動機となった fft.js 導入検討。fft.js 導入自体は別スコープ）

---

## フェーズ進捗

- P1: ローカル移行（packageManager/minimumReleaseAge 設定 → lockfile 生成 → allowlist 実測 → 各種ローカル検証、計画書ステップ1-6） [✅ 完了]
- P2: CI ワークフロー更新 + ドキュメント更新（同一ブランチ・同一PR。ci.yml/ci-smoke.yml/deploy-pages.yml の pnpm 化、Dependabot、OSV-Scanner、CLAUDE.md/README.md 更新、PR作成・グリーン確認、計画書ステップ7-12） [✅ 完了]
- P3: 統合検証（ブラウザ実地確認 → マージ → Deploy/週次OSV グリーン確認 → 進捗ログ更新、計画書ステップ13-15） [✅ 完了]

---

## 本日の作業（時系列）

### Step 1: package.json / pnpm-workspace.yaml のセットアップ ✅
- **作業内容**:
  - `package.json` に `packageManager: "pnpm@11.9.0+sha512.<hex-hash>"` を追加
  - `pnpm-workspace.yaml` を新規作成し `minimumReleaseAge: 1440`（1日）を設定
- **意思決定（実装時判明）**:
  - corepack のハッシュ記法は npm の `dist.integrity`（`sha512-<base64>`）ではなく `sha512.<hex>` 形式。`npm view pnpm@11.9.0 dist.integrity` の base64 値を hex にデコードして使用
  - pnpm v11 では `minimumReleaseAge`/`onlyBuiltDependencies`（→ `allowBuilds` に改名）の設定場所が `package.json` の `pnpm` フィールドから `pnpm-workspace.yaml` へ移動済み（[公式ドキュメント](https://pnpm.io/settings)で確認）。計画書はこれを反映して修正済み
- **検証**: `pnpm install` が正常終了することを確認

### Step 2-4: lockfile 移行 + allowlist 実測 ✅
- **作業内容**:
  - `package-lock.json` を削除、`pnpm install` で `pnpm-lock.yaml` を新規生成
  - クリーンインストール（`rm -rf node_modules && pnpm install`）でブロックされたビルドスクリプトを観測
- **生成物**: `pnpm-lock.yaml`
- **検証結果**: ブロックされたビルドスクリプトは検出されなかった。`node_modules/.pnpm` を確認したところ `esbuild` 自体が存在せず、Vite 8 は `@rolldown+binding-darwin-arm64` のネイティブバイナリ（`.node` ファイル）を `optionalDependencies` 経由で配布しており postinstall 不要と判明。`allowBuilds` への追加は不要と判断
- **意思決定**: `pnpm approve-builds` は使わず（計画通り）、実測のみで判断

### Step 5-6: ローカル検証 ✅
- **作業内容**: `pnpm run typecheck`/`lint`/`format:check`/`test`/`build`、`pnpm exec playwright install --with-deps chromium` → `pnpm run test:e2e`（3回連続）
- **問題**: `pnpm-lock.yaml`（生成ファイル）が Prettier のチェック対象に含まれ `format:check` が失敗 → `.prettierignore` に `pnpm-lock.yaml` を追加して解消
- **検証**: typecheck/lint/format:check/test(32 tests)/build 全て成功。E2E 3回連続グリーン（9 passed, 3 skipped each）

### Step 7-11: CI ワークフロー + Dependabot + OSV-Scanner + ドキュメント更新（同一PR） ✅
- **作業内容**:
  - `pnpm/action-setup`（v6.0.9 = `0ebf47130e4866e96fce0953f49152a61190b271`）・`google/osv-scanner-action`（v2.3.8 = `9a498708959aeaef5ef730655706c5a1df1edbc2`）の最新コミット SHA を `gh api` で取得し固定
  - `ci.yml`/`ci-smoke.yml`/`deploy-pages.yml` を pnpm 化（`pnpm/action-setup` → `actions/setup-node`（`cache: pnpm`）の順序を厳守）
  - `.github/dependabot.yml`（github-actions のみ）、`osv-scanner.toml`（空のトリアージテンプレート）、`osv-scanner-pr.yml`/`osv-scanner-scheduled.yml` を新規作成
  - `pnpm/action-setup` は `version:` パラメータ省略可（`package.json` の `packageManager` を自動検出）と確認し省略
  - CLAUDE.md に「サプライチェーンセキュリティ方針」節を新設、「依存関係」節の原則文を見直し、README.md も pnpm 表記に更新
- **生成物**: `.github/workflows/ci.yml`（更新）, `ci-smoke.yml`（更新）, `deploy-pages.yml`（更新）, `osv-scanner-pr.yml`（新規）, `osv-scanner-scheduled.yml`（新規）, `.github/dependabot.yml`（新規）, `osv-scanner.toml`（新規）, `CLAUDE.md`（更新）, `README.md`（更新）
- **検証**: YAML構文チェック（Python `yaml.safe_load`）全ファイル OK
- **意思決定**: `.ai-workspace/20260708-001`/`002`（別スコープの音声合成研究レポート）はこの PR に含めず、pnpm 関連ファイルのみを個別 `git add` してコミット

### Step 12: PR 作成 + ブラウザ実地確認 ✅
- **作業内容**: ブランチ `pnpm-security-hardening` で PR #1 作成。ローカル `pnpm run dev` + Playwright で初期化〜録音〜周波解析〜合成再生〜原音比較の一連のフローを確認
- **検証**: PR 上で CI / CI Smoke / OSV-Scanner(PR差分) 3ワークフロー全てグリーン。ブラウザ実地確認でコンソールエラーなし

### Step 13: main マージ + Deploy/週次OSV グリーン確認 ✅
- **作業内容**: PR #1 を main にマージ（squash ではなく merge commit、ブランチ削除）
- **検証**: マージ後 push トリガーで CI / CI Smoke / Deploy to GitHub Pages / OSV-Scanner(scheduled) の4ワークフロー全て初回グリーン。Dependabot Updates（github-actions エコシステム）も正常動作を確認（更新検出ジョブ2件、いずれも success）。ライブサイト（https://masnak.github.io/waveVisualizer/）で初期化〜録音〜周波解析の実地確認も成功
- **意思決定**: OSV-Scanner(scheduled) の `push: branches: [main]` トリガー併記（DevOps Automator指摘、計画書ステップ9）が正しく機能し、`schedule` の発火を待たず初回グリーンを確認できた

---

## 検証チェックリスト（計画書 3章「完了基準」より転記）

- [x] `pnpm-lock.yaml` がコミットされ、`package-lock.json` が削除されている
- [x] `package.json` に `packageManager` が設定され、`pnpm-workspace.yaml` に `minimumReleaseAge`/`allowBuilds`（実装時判明: pnpm v11 の配置先。allowBuilds は実測の結果空のまま）が設定されている
- [x] 新規追加のサードパーティ Action（`pnpm/action-setup`、`google/osv-scanner-action`）がコミット SHA で固定されている
- [x] `.github/dependabot.yml`（github-actions のみ。npm エコシステムは延期）が追加されている
- [x] 既存 CI ワークフロー3本（`deploy-pages.yml` 含む）が `pnpm install --frozen-lockfile` を使用し、初回 push でグリーンになる
- [x] OSV-Scanner のワークフロー（PR差分・週次フルスキャン、別ファイル、permissions 最小化）が追加され、初回実行が成功する（既存依存に脆弱性はヒットせず、`osv-scanner.toml` のトリアージは不要だった）
- [x] CLAUDE.md / README.md のコマンド記載が pnpm に統一され、記載通りに実際に動く。CLAUDE.md にサプライチェーンセキュリティ方針の記載がある
- [x] 主要ワークフロー（初期化 → 録音 → 周波解析 → 合成再生 → 原音との比較）がブラウザ実地で通り、コンソールエラーなし
- [x] `pnpm run typecheck` / `lint` / `format:check` / `test` / `test:e2e` / `build` が全てエラーなく完了する
- [x] 進捗ログ更新済み

---

## 品質保証チェックリスト

### コード品質
- [x] `pnpm run typecheck`（strict, allowJs off）エラーゼロ
- [x] `pnpm run lint` エラーゼロ
- [x] `pnpm run format:check` エラーゼロ

### 動作品質
- [x] `pnpm test`（Vitest、32 tests）全グリーン
- [x] `pnpm run test:e2e`（Playwright）全グリーン（ローカルで3回連続実行）
- [x] `pnpm run build` 成功
- [x] ブラウザ実地確認（初期化 → 録音 → 音声再生 → 周波解析 → 成分選択 → 合成再生 → 原音との比較）でコンソールエラーなし
- [x] GitHub Actions: CI / CI Smoke / OSV-Scanner(PR差分) が PR 上でグリーン
- [x] GitHub Actions: マージ後、CI / CI Smoke / Deploy to GitHub Pages / OSV-Scanner(週次) が初回グリーン
- [x] ライブサイト（https://masnak.github.io/waveVisualizer/）が pnpm 化後も正常稼働（実地確認済み）

### 記録品質
- [x] 既知バグ・意図的な運用判断（Dependabot npm 延期、deploy-pages 事前検証省略、週次 OSV hard-fail 維持等）が本ファイルまたは計画書に記録済み
- [x] コミット履歴を本ファイルに記録（下記）

---

## 問題・エラー記録

### [問題ID: E001] corepack の packageManager ハッシュ記法の誤り
- **発生日時**: 2026-07-08
- **種別**: ツール仕様の誤解
- **影響度**: 低（`pnpm install` が起動時エラーで即座に失敗、実害なし）
- **状態**: 解決
- **原因**: `packageManager` フィールドのハッシュ記法を npm の `dist.integrity`（`sha512-<base64>`）形式で記述したが、corepack が期待する記法は `sha512.<hex>`（ドット区切り・16進数）だった
- **対処**: base64 値を `base64 -d | xxd -p` で hex にデコードし直して修正
- **再発防止**: 計画書 1.2 節・作業ステップ1 に正しい記法を追記済み

### [問題ID: E002] pnpm v11 での設定場所変更（onlyBuiltDependencies → allowBuilds）
- **発生日時**: 2026-07-08
- **種別**: 計画時点の情報陳腐化（PM/Software Architect が実装前レビューで懸念していた通りの事象）
- **影響度**: 低（実装前に公式ドキュメントで確認し計画修正、実害なし）
- **状態**: 解決
- **原因**: 計画時点で参照した情報は pnpm v10 相当のものであり、pnpm v11（実装時点の実際の pnpm バージョン）では `onlyBuiltDependencies` が `allowBuilds` に改名され `package.json` から `pnpm-workspace.yaml` へ配置が移動していた
- **対処**: `pnpm-workspace.yaml` を新規作成し `minimumReleaseAge`/`allowBuilds` の両方をそこに配置。計画書・CLAUDE.md 双方を実装結果に合わせて修正
- **再発防止**: なし（バージョン間で設定場所が変わるのは pnpm 側の仕様変更であり、次回変更時も実装時点で都度公式ドキュメントを確認する運用で対応）

### [問題ID: E003] pnpm-lock.yaml が Prettier のチェック対象に含まれていた
- **発生日時**: 2026-07-08
- **種別**: ツール設定漏れ
- **影響度**: 低
- **状態**: 解決
- **原因**: `.prettierignore` に生成ファイルである `pnpm-lock.yaml` の除外設定がなかった
- **対処**: `.prettierignore` に `pnpm-lock.yaml` を追加
- **再発防止**: 対応済み（今後 lockfile が再生成されても影響なし）

---

## コミット履歴

1. `14b1a3d` Migrate to pnpm and harden the supply chain (frozen lockfile, script blocking, OSV-Scanner)（ブランチ `pnpm-security-hardening`）
2. `51c73a1` Merge pull request #1 from masnak/pnpm-security-hardening（PR #1、CI/CI Smoke/OSV-Scanner(PR差分) 3ワークフロー全てグリーンの上でマージ）
3. マージ後 push トリガーで CI / CI Smoke / Deploy to GitHub Pages / OSV-Scanner(scheduled) の4ワークフロー全て初回グリーン、Dependabot Updates（github-actions）も正常動作確認

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

**最終更新:** 2026-07-08（**実装完了**。PR #1 作成 → CI/CI Smoke/OSV-Scanner(PR差分) グリーン → main マージ → CI/CI Smoke/Deploy to GitHub Pages/OSV-Scanner(週次) 初回グリーン → ライブサイト実地確認まで完走。実装中に pnpm v11 での設定場所変更（`onlyBuiltDependencies`→`allowBuilds`、`pnpm-workspace.yaml`への集約）を検出し計画書を追随修正）
