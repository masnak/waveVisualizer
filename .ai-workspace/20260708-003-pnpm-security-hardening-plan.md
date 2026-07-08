# pnpm 移行 + サプライチェーンセキュリティ強化（frozen lockfile / ignore-scripts / OSV Scanner）

> **命名規則**: `20260708-003-pnpm-security-hardening-plan.md`。対応する Progress は同じ NNN（003）を使う。

作成日: 2026-07-08
対象: パッケージ管理基盤（`package.json` / lockfile / CI ワークフロー3本）
参照: CLAUDE.md（「依存関係」節「外部 JavaScript ライブラリ不要」の原則）/ `.ai-workspace/20260708-002-sustained-tone-synthesis-quality-proposal.md`（この計画の動機となった fft.js 導入検討。fft.js 導入そのものは本計画のスコープ外）

ステータス: 完了（実装済み、PR #1 マージ済み。詳細は `progress-20260708-003-pnpm-security-hardening.md` 参照）

---

## Development Philosophy Check

- **堅牢**: lockfile の frozen 強制でローカル/CI の依存解決を完全一致させる。ビルドスクリプトの既定ブロックで未知の依存の実行時副作用を排除する
- **セキュア**: サプライチェーン攻撃（悪意ある postinstall スクリプト、既知脆弱性を持つ依存）への耐性を高めることが本計画そのものの目的
- **明快**: pnpm 公式ドキュメントが推奨する構成に極力従い、独自ルールを増やさない
- **修正容易**: 3つの既存 CI ワークフローへの変更は機械的な置換が中心。段階的に検証しながら進める

## 0. 冒頭まとめ

### 0.1 目的

- fft.js 等の外部 npm パッケージ導入（別スコープ）に先立ち、サプライチェーン攻撃への耐性を高めるパッケージ管理基盤を整備する
- 具体的には: pnpm への移行、CI 上での lockfile 整合性強制（frozen-lockfile）、依存パッケージのインストール時スクリプト実行を既定で無効化する運用、既知脆弱性の自動検知（OSV Scanner）の4点

### 0.2 現在の問題

- npm + `package-lock.json` 運用。`npm ci` は lockfile 通りにインストールするが、依存パッケージの `preinstall`/`install`/`postinstall` スクリプトは既定で実行される（サプライチェーン攻撃の主要な侵入経路の1つ）
- 既知脆弱性を検知する仕組みが CI に存在しない（`npm audit` すら実行されていない）
- 外部パッケージ（fft.js）導入を控えているが、現状の基盤ではその依存（および将来追加される依存）のリスクを緩和・検知する仕組みがない

### 0.3 原因

- プロジェクト発足時（M1、TS+TDD テスト基盤導入）はセキュリティ強化までスコープに含めていなかった。CLAUDE.md に明記された「外部 JavaScript ライブラリ不要」の原則のもと、実行時の外部依存追加を想定していなかった
- fft.js 導入検討（`.ai-workspace/20260708-002-*`）を機に、このアプリ初の実行時外部依存を追加する前提が生まれ、それに先立つ基盤整備としてユーザーから本計画が要求された

### 0.4 解決方針

1. **パッケージマネージャを npm → pnpm へ移行**。pnpm v10 以降の既定挙動である「依存パッケージのライフサイクルスクリプトを既定でブロックし、明示的に許可したものだけ実行する」機能をそのまま活用する（[Socket.dev: pnpm 10.0.0 Blocks Lifecycle Scripts by Default](https://socket.dev/blog/pnpm-10-0-0-blocks-lifecycle-scripts-by-default)）。ローカル環境は Node 24 + corepack 経由で pnpm 11.9.0 が既に利用可能なことを確認済み
2. **CI（CI / CI Smoke / Deploy to GitHub Pages の3ワークフロー）を `pnpm install --frozen-lockfile` に統一**
3. **OSV-Scanner**（Google製、OSV.dev データベース参照、`pnpm-lock.yaml` 対応済み）を CI に追加

### 0.5 実装方針

- スモールステップ（1 ステップ = 1 つの検証可能な変更）
- 生成物確認（期待ファイル・差分・CI 実行結果）
- pnpm 移行はビルド・テストパイプライン全体に影響するため、ローカルでの動作確認（`typecheck`/`lint`/`format:check`/`test`/`test:e2e`/`build`）を各ステップで挟む
- CI への反映は最後にまとめて行い、push 後に3ワークフロー + 新設の OSV-Scanner ワークフローがグリーンになることを確認する

### 0.6 解決後のフロー説明（簡潔）

1. 開発者は `pnpm install` でローカルに依存を導入する。依存パッケージのライフサイクルスクリプトは既定でブロックされ、正当に必要なもの（例: `esbuild` のネイティブバイナリ取得）は `pnpm.onlyBuiltDependencies`（`package.json`）に明示的にリストされたものだけが実行される
2. CI の各ワークフローは `pnpm install --frozen-lockfile` を実行する。`pnpm-lock.yaml` と `package.json` に不整合があれば即座に失敗する
3. OSV-Scanner が依存の既知脆弱性を PR ごと（差分）・週次（フルスキャン）でスキャンする。**いずれも検知時は CI を失敗（fail）させる**（ユーザー選択。既存依存への事後的な脆弱性開示も含め、常に赤色で明示的に可視化する方針）

---

## 1. 仕様決定（推奨案を明示）

### 1.1 決定事項（確定済み・根拠を記載）

- **既存 `package-lock.json` は削除し、`pnpm-lock.yaml` に一本化する**
  - 堅牢: 二重ロックファイルは依存解決の一貫性を損なう（どちらが真実かが曖昧になる）
  - セキュア: pnpm の厳密な依存解決（他パッケージのネストした依存への「幽霊依存」を防ぐ構造）を活かすには pnpm-lock.yaml 単独運用が前提
  - 明快: 1 プロジェクト 1 ロックファイルの原則を維持
  - 修正容易: 移行時の一度きりの作業で完結する

- **OSV-Scanner を採用する**（ユーザー指定のツール。他候補との比較検討は行わない）
  - `pnpm-lock.yaml` を含む主要ロックファイル形式に対応済み（[OSV-Scanner 公式ドキュメント](https://google.github.io/osv-scanner/github-action/)）
  - Google 公式の再利用可能ワークフロー（`google/osv-scanner-action`）が GitHub Actions 向けに提供されている

- **`packageManager` フィールドで pnpm バージョンを固定する**
  - `package.json` に `"packageManager": "pnpm@<現行バージョン>"` を追加。corepack が解釈するフィールドで、ローカル開発者間・CI 間での pnpm バージョンの一貫性を保証する（堅牢）。代替案なし（バージョン不定は再現性を損なうため）

- **CLAUDE.md / README.md のコマンド表記を pnpm に全面更新する**
  - 「開発・検証」節の `npm ci` / `npm run dev` 等の記載を `pnpm install` / `pnpm run dev` 等に置換。CLAUDE.md は記載コマンドが実際に動くことを検証する運用（M2-12 で確立済み）のため、実態と乖離させない。代替案なし（両表記併記は保守コストが増すだけで利点がない）

- **pnpm の CI セットアップ方式は `pnpm/action-setup` を採用する**（ユーザー確認済み）
  - pnpm 公式が GitHub Actions 向けに明示的に推奨する専用アクション（[pnpm 公式 CI ドキュメント](https://pnpm.io/continuous-integration)）
  - corepack 手動セットアップは見送り。corepack は2025年に npm レジストリの署名鍵ローテーションに伴い `cannot find matching keyid` エラーが多発した実績があり（[Vercel Knowledge Base](https://vercel.com/kb/guide/corepack-errors-github-actions)、[actions/setup-node#1222](https://github.com/actions/setup-node/issues/1222)）、CI の安定性を優先した

- **ライフサイクルスクリプトのブロックは実測して allowlist 化する運用とする**（ユーザー確認済み）
  - pnpm 11.9.0（ローカル確認済み）は既定でこの保護が有効
  - 移行作業中に実際にブロックされたパッケージ（`esbuild` 等が候補）を観測し、正当なものだけ `pnpm.onlyBuiltDependencies`（`package.json`）で個別に許可する。全面許可（保護の実質無効化）は行わない

- **OSV-Scanner は PR 差分スキャン・週次フルスキャンの両方を CI 失敗（fail）扱いにする**（ユーザー確認済み。推奨案の「週次は非ブロッキング」より厳格な方針を採用）
  - 新規追加された脆弱性・既存依存に対する事後的な脆弱性開示のいずれも、検知時は常に赤色で明示的に可視化する
  - トレードオフ: 自分でコードを変更していなくても、依存先ライブラリの脆弱性が新規に開示されただけで週次スキャンが失敗表示になりうる。これは意図した運用（早期発見を優先）として受け入れる
  - **追記（Phase 3 Security Engineer / Software Architect 指摘）**: 「hard-fail」は「無条件で放置してよい」という意味ではない。初回スキャンで既存 devDependencies（Vite/esbuild/Playwright 等）に脆弱性がヒットする可能性があり、その場合「初回グリーン」（3章 完了基準）がそのままでは達成不能になる。`osv-scanner.toml` に期限付き ignore（トリアージ済みの一時許容）を書けるようにし、hard-fail を「無視できないゲート」として維持しつつ「詰む」状態を避ける

### 1.2 追加決定事項（Phase 3 エージェントレビューで追記）

- **pnpm 選定の根拠を明示する**（Software Architect 指摘への対応）
  - frozen-lockfile 自体は `npm ci` で既に同等の効果があり、OSV-Scanner も `package-lock.json` に対応済みで、ignore-scripts も npm の `.npmrc`（`ignore-scripts=true`）で実現可能。したがって pnpm 固有の便益は「依存パッケージのライフサイクルスクリプトを**既定でブロックし、許可制**にする」設計（v10 以降の既定挙動）に限られる
  - この既定 deny（オプトイン許可制）は、npm の `.npmrc` 相当（オプトアウト方式、`--ignore-scripts` を都度付け忘れると素通りする）より事故りにくい。ソロ開発では「フラグを付け忘れる」ことそのものが最大のリスクであり、既定で安全側に倒れる pnpm の設計を採用する
  - 対案（npm 単体ハードニング: `.npmrc` に `ignore-scripts=true` を設定するのみ）は却下。理由: 個別パッケージの正当なビルドスクリプトを許可する仕組みが npm 側になく、「全部無効化」か「全部有効化」の二択になり、allowlist 運用ができない

- **新規に追加するサードパーティ GitHub Actions（`pnpm/action-setup`、`google/osv-scanner-action`）はコミット SHA で固定する**（Security Engineer 最重要指摘への対応）
  - 理由: 「サプライチェーンセキュリティ強化」を謳う計画が、可変タグ運用の新規サードパーティ Action を追加するのは自己矛盾。可変タグはメンテナアカウント侵害時に差し替え可能な既知の攻撃経路（`tj-actions/changed-files` 事件等）
  - 既存3ワークフローの `actions/checkout@v4` 等（GitHub 公式 Action）は本計画のスコープ外とし、SHA 固定は見送る（Software Architect の「過剰な複雑性を持ち込まない」指摘とのバランス。公式 Action は信頼度が異なり、優先度は新規サードパーティ Action より低い）

- **`minimumReleaseAge` を設定する**（Security Engineer 推奨、新規追加）
  - 公開直後（一定期間内）のパッケージバージョンのインストールを避けるクールダウン機能。本計画が主眼とする脅威（悪意ある postinstall スクリプトを含む新規公開パッケージ）に直接効く、数少ない「攻撃そのものを防ぐ」対策。OSV-Scanner は既知報告済み脆弱性のみ検知でき、公開直後の未報告の悪性パッケージは検知できないため、frozen-lockfile・OSV-Scanner いずれのゲートも防げない脅威に対する具体的な補完策として追加する
  - **実装時判明（訂正）**: 当初 `package.json` の `pnpm` フィールドを想定していたが、pnpm v11 では設定場所が `pnpm-workspace.yaml` に一本化されている（[pnpm 公式 settings ドキュメント](https://pnpm.io/settings)で確認）。実装は `pnpm-workspace.yaml` の `minimumReleaseAge: 10080`（7日=10080分、1日=1440分から2026-07-08 にユーザー判断で1週間へ変更。悪意あるパッケージの多くは公開後数日以内にコミュニティ・自動スキャナーにより発見・撤回されるため、より長いクールダウンでその大半を回避できる）

- **Dependabot は `github-actions` エコシステムのみ今回追加し、`npm` エコシステムは延期する**（Security Engineer 推奨を、Phase 5 PM 精査 + ユーザー確認で範囲調整）
  - `.github/dependabot.yml` に `github-actions` エコシステム（Action のタグ更新 PR を自動生成、SHA 固定の陳腐化に追従。更新頻度が低くノイズが小さい）のみ設定する
  - `npm` エコシステムは延期。理由: 実行時依存が現状ゼロ（fft.js もスコープ外）の段階で、更新頻度の高い devDeps（Vite/Playwright/ESLint/TS/Vitest 等）に Dependabot をかけると、ソロ開発者に恒常的な PR レビュー負荷が乗る。OSV-Scanner の hard-fail 検知＋手動 `pnpm update` で当面は足り、fft.js 等の実依存が実際に入ってから追加する
  - `npm audit` 相当の追加ツールは不要と判断（OSV-Scanner が GitHub Advisory Database を包含しているため重複）

- **`onlyBuiltDependencies`（実装時判明・訂正: pnpm v11 では `allowBuilds` に改名され `pnpm-workspace.yaml` へ移動、[pnpm 公式ドキュメント](https://pnpm.io/settings)で確認）の恒常運用コストを明記し、一括承認を禁止する**（Security Engineer・Software Architect 指摘への対応）
  - 許可は当該パッケージの**将来の全バージョン**に対してビルド実行権を与える点に注意する（メジャーバージョンアップ時は許可済みでも実質的な再監査が望ましい、という運用上の注意点として記録に残す）
  - `pnpm approve-builds` の対話的な一括承認、および全許可設定は明示的に禁止する。将来新しい依存を追加するたびに、ブロックされたスクリプトを個別に確認し `allowBuilds` に追記する運用コストが恒常的に発生することを受け入れる

- **ロールバック手順を明記する**（Software Architect 指摘への対応）
  - pnpm 移行に伴うファイル変更（`package-lock.json` 削除、CI ワークフロー書き換え）は全て git 管理下にあり、問題が発生した場合は該当コミットを `git revert` すれば `package-lock.json` を含め旧 npm 運用に即座に戻せる。point-of-no-return となる不可逆操作は本計画に存在しない
  - `deploy-pages.yml` は GitHub Pages への本番デプロイに直結するが、`needs: build` の構造上 build job が失敗すれば deploy job は実行されず、GitHub Pages は直前の成功デプロイを保持し続ける（サイトが壊れた状態で公開されることはない）

- **`deploy-pages.yml` は `workflow_dispatch` による事前検証を行わず、`ci.yml`/`ci-smoke.yml` と同一 PR で機械的に pnpm 化する**（Phase 5 PM 精査 + ユーザー確認。上記ロールバック根拠の帰結）
  - 理由: blast radius がほぼゼロ（build 失敗時も本番サイトは直前の成功デプロイを保持）と計画自身が既に明記しているため、一時トリガーの追加・撤去という作業チャーンをかける実益が薄い。変更内容も ci.yml と同一の機械的置換であり、PR 上の CI で pnpm 化の妥当性は検証済み。万一 deploy 固有の問題があっても fix-forward（追加コミットで即座に修正）で対応する

---

## 2. 作業ステップ（番号付き・具体）

### ローカル移行

1. `package.json` に `packageManager` フィールド（現行 pnpm バージョン固定。`pnpm@<version>+sha512.<hex-hash>` 形式で corepack の integrity-hash も併せて固定し、Action の SHA 固定と同じ思想を pnpm 本体にも適用する。**実装時判明**: corepack のハッシュ記法は npm の `dist.integrity`（`sha512-<base64>`）ではなく `sha512.<hex>` 形式。`npm view pnpm@<version> dist.integrity` で取得した base64 値を hex にデコードし直す必要がある）を追加。`minimumReleaseAge` は `pnpm-workspace.yaml`（新規作成）に設定（実装時判明、上記1.2節参照）
2. `package-lock.json` を削除し、`pnpm install` を実行して `pnpm-lock.yaml` を新規生成
3. 生成された `pnpm-lock.yaml` と、`pnpm install` 実行時にブロックされたビルドスクリプトの一覧を確認する
4. ブロックされたスクリプトのうち正当に必要なもの（`esbuild` 等が候補。**推測で先回りせず実測結果のみで追加**）を `allowBuilds`（`pnpm-workspace.yaml`、実装時判明・訂正: pnpm v11 では `onlyBuiltDependencies` から改名され配置も移動）に個別追加し、`pnpm install` を再実行して解消することを確認（`pnpm approve-builds` の対話的一括承認は使わない）。**実装結果**: 実測の結果ブロックされたビルドスクリプトは検出されなかった（Vite 8 は esbuild ではなく Rolldown のネイティブバイナリを `optionalDependencies` 経由で配布しており postinstall 不要。`.pnpm` 配下に `esbuild` 自体が存在しないことを確認）。`allowBuilds` への追加は不要
5. ローカルで `pnpm run typecheck` / `pnpm run lint` / `pnpm run format:check` / `pnpm test` / `pnpm run build` を1つずつ実行し、npm 時代と同じ結果になることを確認。pnpm の厳密な `node_modules`（symlink 構造、npm と異なりホイストされない幽霊依存を許さない）により、npm 時代に無自覚に依存していたパッケージがここで解決エラーとして表面化する可能性がある。発生した場合は `.npmrc` の `public-hoist-pattern`/`node-linker=hoisted` を退避策として検討する（現時点では想定のみ、発生しなければ何もしない）
6. `pnpm exec playwright install --with-deps chromium` → `pnpm run test:e2e` を実行し、全テストがグリーンになることを確認

### CI ワークフロー更新（PR 経由で検証してから main へ反映）

7. `.github/workflows/ci.yml` / `ci-smoke.yml` / `deploy-pages.yml` の3ファイルを同一 PR で pnpm 化する（`deploy-pages.yml` も含めて機械的に一括置換、`workflow_dispatch` による個別事前検証は行わない）。**アクションの実行順序に注意**（`pnpm/action-setup` を `actions/setup-node` より前に置く。`cache: pnpm` は内部で `pnpm store path` を呼ぶため逆順だと失敗する）。`pnpm/action-setup` はコミット SHA で固定（実装時点の最新リリース v6.0.9 = `0ebf47130e4866e96fce0953f49152a61190b271`。`version:` パラメータは省略可 — `package.json` の `packageManager` フィールドを自動検出する）。`npm ci` → `pnpm install --frozen-lockfile`、`cache: npm` → `cache: pnpm`、`npx playwright install/test` → `pnpm exec playwright install/test` に置換
8. `.github/dependabot.yml` を新規作成する（`github-actions` エコシステムのみ。`npm` エコシステムは延期、1.2節参照）。**auto-merge は有効化しない**（SHA 固定は「新しい SHA を人が確認してからマージする」ことが前提の防御であり、auto-merge を有効にすると SHA 固定の意味が失われる）
9. `osv-scanner.toml` を用意し、期限付き ignore によるトリアージ経路を確保した上で、OSV-Scanner のワークフローを新規追加する（PR 差分スキャン用と週次フルスキャン用の**別ファイル**、`osv-scanner-pr.yml` / `osv-scanner-scheduled.yml` として新規作成し、Google 公式 reusable workflow `osv-scanner-reusable-pr.yml` / `osv-scanner-reusable.yml` を `google/osv-scanner-action` 側コミット SHA 固定（実装時点の最新リリース v2.3.8 = `9a498708959aeaef5ef730655706c5a1df1edbc2`）で呼び出す。`fail-on-vuln: true` を明示指定）。呼び出し側 workflow の `permissions` を明示（`contents: read` に加え SARIF アップロード用の `security-events: write`、`actions: read`）。**週次フル用ワークフローは `on: schedule` だけでなく `push: branches: [main]`（または `workflow_dispatch`）も併記する**（`schedule` のみだと cron 発火まで最大1週間かかり、マージ直後に「初回グリーン」を確認できないため）。週次スケジュールは GitHub 仕様上60日リポジトリ無活動で自動停止する点を認識しておく

### ドキュメント更新（CI 変更と同一ブランチ・同一 PR に含める）

10. CLAUDE.md の「開発・検証」節・npm scripts 参照箇所を pnpm コマンド表記に更新。加えて「依存関係」節の「外部 JavaScript ライブラリ不要」の原則文を、pnpm 移行後の実態に合わせて見直す（例:「現状は外部ランタイム依存ゼロ。追加する場合は `onlyBuiltDependencies` での allowlist 運用と OSV-Scanner でのスキャンを前提とする」）。新設したサプライチェーンセキュリティ方針（pnpm 選定理由・allowlist 運用コスト・SHA 固定方針・Dependabot 併設範囲）を簡潔に記載するセクションを追加。**Dependabot の `npm` エコシステムを延期した判断も明記し、「fft.js 等の実行時依存を初めて追加するタイミングで追加する」というトリガー条件を残す**（記憶依存を避けるため）
11. README.md の実行コマンド記載を同様に更新（新規貢献者向けに `corepack enable` の一言も追加）。ドキュメント編集後は `pnpm run format:check` を通す（CLAUDE.md/README.md も Prettier の対象）。**7〜11（CI ワークフロー変更 + ドキュメント更新）はここまで同一ブランチで作業し、まとめて1つの PR として提出する**（別 PR に分けると、main が一時的に「CI は pnpm 化済みだが README は npm 表記のまま」という不整合状態になる）
12. PR を作成し、**CI / CI Smoke / OSV-Scanner(PR差分) が PR 上でグリーンになることを確認**

### 統合検証

13. ブラウザでの実地確認: `pnpm run dev` でローカルサーバを起動し、「初期化 → 録音 → 音声再生 → 周波解析 → 成分選択 → 合成再生 → 原音との比較」の一連のフローを通し、コンソールエラーがないことを確認（依存関係入れ替えによる非破壊性の確認）
14. PR を main にマージし、`deploy-pages.yml`（本番デプロイ）と OSV-Scanner 週次フルスキャンが初回グリーンになることを確認。**初回スキャンで既存 devDependencies に脆弱性がヒットした場合**は、内容を確認した上で `osv-scanner.toml` に期限付き ignore を追記してグリーン化する（無条件のゲート無効化はしない）。`deploy-pages.yml` に問題があれば fix-forward で追加コミット対応する
15. 進捗ログ（`progress-20260708-003-*.md`）を更新

---

## 3. 完了基準（Done）

- `pnpm-lock.yaml` がコミットされ、`package-lock.json` が削除されている
- `package.json` に `packageManager` / `pnpm.minimumReleaseAge` / （必要な場合）`pnpm.onlyBuiltDependencies` が設定されている
- 新規追加のサードパーティ Action（`pnpm/action-setup`、`google/osv-scanner-action`）がコミット SHA で固定されている
- `.github/dependabot.yml`（github-actions のみ。npm エコシステムは延期）が追加されている
- 既存 CI ワークフロー3本（`deploy-pages.yml` 含む）が `pnpm install --frozen-lockfile` を使用し、初回 push でグリーンになる
- OSV-Scanner のワークフロー（PR差分・週次フルスキャン、別ファイル、permissions 最小化）が追加され、初回実行が成功する（既存依存に脆弱性がヒットした場合は `osv-scanner.toml` のトリアージを経て成功）
- CLAUDE.md / README.md のコマンド記載が pnpm に統一され、記載通りに実際に動く。CLAUDE.md にサプライチェーンセキュリティ方針の記載がある
- 主要ワークフロー（初期化 → 録音 → 周波解析 → 合成再生 → 原音との比較）がブラウザ実地で通り、コンソールエラーなし
- `npm run typecheck` / `lint` / `format:check` / `test` / `test:e2e` / `build` 相当の pnpm コマンドが全てエラーなく完了する
- 進捗ログ更新済み

---

## レビュー履歴

### Phase 3: 専門エージェントレビュー（2026-07-08、model: opus）

**Security Engineer**
- [最重要・対応済み] 新規サードパーティ Action（`pnpm/action-setup`、`google/osv-scanner-action`）の SHA 固定が計画から欠落。「強化計画が未固定の新規アクションを増やすのは自己矛盾」 → 1.2 節・作業ステップ7/9 に反映
- [対応済み] OSV ワークフローの `permissions` 最小化が未指定 → 作業ステップ9 に反映
- [対応済み] OSV は既知報告済み脆弱性のみ検知でき、公開直後の悪性パッケージ（本計画の主脅威＝悪意ある postinstall）は検知不能。`pnpm.minimumReleaseAge` の追加を推奨 → 1.2 節・作業ステップ1 に反映
- [対応済み] Dependabot 不在（OSV は検知のみで修正 PR を出さない） → 1.2 節・作業ステップ8 に反映
- [対応済み] `onlyBuiltDependencies` は将来の全バージョンに適用される点、`approve-builds` の一括承認・全許可を禁止すべき点 → 1.2 節・作業ステップ4 に反映
- [対応済み] 週次スケジュールは GitHub 仕様上60日無活動で自動停止 → 作業ステップ9 に注記
- npm audit相当の追加ツールは不要（OSV が GitHub Advisory DB を包含）という判断は妥当と評価 → 現状維持

**DevOps Automator**
- [最重要・対応済み] `deploy-pages.yml` は PR トリガーがなく、pnpm 化後の初回実行が必ず本番 push になる非対称性。CI/CI Smoke と同列に「機械的な置換」として扱っていた → 作業ステップを「PR経由で検証→マージ→Deploy検証」に分割し、`workflow_dispatch` での事前検証を追加（作業ステップ7・10・11・15）
- [対応済み] `actions/setup-node` の `cache: pnpm` は `pnpm/action-setup` より後に配置する必要がある（順序を誤ると `Unable to locate executable file: pnpm`） → 作業ステップ7 に明記
- [対応済み] `npx playwright install/test` の `pnpm exec` 化が計画から抜けていた → 作業ステップ6・7 に反映
- [対応済み] OSV-Scanner は PR差分用・週次フル用で別ファイル（`osv-scanner-reusable-pr.yml` / `osv-scanner-reusable.yml`）である点、`permissions` 要件 → 作業ステップ9 に反映

**Software Architect**
- [最重要・対応済み] pnpm 選定の必然性の論拠が薄い（frozen-lockfile は `npm ci` で既に同等、OSV は `package-lock.json` にも対応、ignore-scripts は npm の `.npmrc` でも可能）。pnpm 固有の便益は「既定ブロック＝オプトイン許可制」の設計のみ → 1.2 節に選定根拠の段落を追加（npm 単体ハードニング案との比較・却下理由を明記）
- [対応済み] ロールバック手順の記述がゼロ → 1.2 節に追加（git revert で即座に npm へ戻せる、`deploy-pages.yml` は `needs: build` 構造上サイトが壊れた状態で公開されることはない）
- [対応済み] `onlyBuiltDependencies` の恒常運用コストが未明記。OSV 週次 hard-fail により初回スキャンで「初回グリーン」達成不能になるリスク → 1.2 節・作業ステップ9/15 に `osv-scanner.toml` トリアージ経路を追加
- [対応済み] CLAUDE.md 更新がコマンド表記の置換のみに留まる。「外部 JavaScript ライブラリ不要」原則との整合・セキュリティ方針の記述が抜けている → 作業ステップ12 に反映
- fft.js のスコープ分離は適切と評価（観点2は問題なし） → 現状維持

### Phase 5: PM 精査 + ユーザー確認（2026-07-08）

plan-pm エージェントによる精査結果: 判定「⚠️ 要修正（軽微）」。骨格は妥当だが、個人開発規模に対して2点が過剰、1点はユーザー意図の再確認が必要と指摘。ユーザーとのディスカッションの上、以下の通り確定:

- **Dependabot の `npm` エコシステムは延期**（`github-actions` エコシステムのみ今回追加）。実行時依存ゼロの現段階では恒常的な PR レビュー負荷に見合わないため。fft.js 等の実依存投入後に追加する → 1.2 節・作業ステップ8 に反映
- **`deploy-pages.yml` は `ci.yml`/`ci-smoke.yml` と同一 PR で機械的に pnpm 化し、`workflow_dispatch` による個別事前検証は行わない**。計画自身が明記する「build 失敗時も本番は直前の成功デプロイを保持する」低リスク性に対し、一時トリガーの出し入れという作業チャーンが見合わないため。問題があれば fix-forward で対応 → 1.2 節・作業ステップ7/14 に反映
- **週次 OSV-Scanner の hard-fail 方針は維持**（Phase 2 での選択を再確認の上、変更なし）。`osv-scanner.toml` によるトリアージの恒常運用コストを認識した上で、早期発見を優先する

その他 PM 指摘（ステップ12/13の統合、ステップ2〜4の粒度整理、`minimumReleaseAge`/`onlyBuiltDependencies` の設定場所を実装時に公式ドキュメントで確認する旨）は軽微な記述改善のため、作業ステップ本文に反映済み（実装時に該当バージョンの公式ドキュメントを確認する運用は作業ステップ1・4の性質上、実施時に自然に行われるため計画書への追記は省略）。

### Phase 6: 最終レビュー（2026-07-08、model: opus、3名とも判定「GO」）

**Security Engineer**: Dependabot npm 延期・deploy-pages 事前検証省略のいずれも新たなセキュリティ穴を生まないことを確認（deploy 側は `permissions`/secrets に触れず availability リスクのみで `needs: build` により保護済み。Dependabot 延期は OSV hard-fail という検知ゲートを維持したままの「自動修正PRの先送り」に留まる）。追加指摘: (1) `minimumReleaseAge` 設定（ステップ1）と `pnpm-lock.yaml` 初回生成（ステップ2）の順序次第で lockfile が npm 時代とバイト単位一致しない可能性 → 軽微な注意事項として認識のみで許容, (2) Dependabot(github-actions) の auto-merge を無効に保つ旨を明記 → 反映済み（ステップ8）, (3) npm Dependabot 延期のトリガー条件を CLAUDE.md に明記 → 反映済み（ステップ10）。リポジトリが public のため OSV の SARIF アップロードに GHAS 不要であることも確認

**DevOps Automator**: deploy-pages 事前検証省略はリスクなしと確認（実ファイルで `needs: build` 構造を再確認）。deploy-pages 固有の `concurrency`/`environment` 設定は pnpm 移行と無関係で無変更が正しいことも確認。[最重要・対応済み] 週次 OSV フルスキャンが `on: schedule` のみだとマージ直後に「初回グリーン」を確認できない（cron 発火まで最大1週間） → ステップ9 に `push: branches: [main]`/`workflow_dispatch` の併記を追加。[対応済み] CLAUDE.md/README.md は `prettier --check` の対象であり、CI 変更と別 PR に分けると main が一時的に不整合状態になる → ステップ10-12 の順序を修正し同一 PR・同一ブランチであることを明記

**Software Architect**: 縮小2判断（Dependabot npm延期、deploy事前検証省略）はいずれも「守りすぎでも攻めすぎでもない」妥当な範囲と評価。全体最適（当初4要求への対応関係）・実装順（進捗管理表 P1-P4 と作業ステップの整合）ともに問題なしと評価。[対応済み] `packageManager` の integrity-hash 固定が未言及（Action の SHA 固定と同じ思想の抜け） → ステップ1 に反映。[対応済み] pnpm の厳密 `node_modules` によるファントム依存破綻リスクが未記載 → ステップ5 に退避策（`.npmrc` の hoist 設定）を注記として追加

**結論**: 3名とも「このまま実装に進んでよい（GO）」。指摘は全て軽微な記述改善であり、計画の骨格・スコープ・実装順序に変更はない。
