# course リポジトリ調査 — Claude 開発インフラの waveVisualizer 導入レポート

**作成日:** 2026-07-07
**調査対象:** /Users/mn/workspace/makerkit/course（Keirisan プロジェクト）
**導入先:** /Users/mn/workspace/waveVisualizer
**目的:** course で運用実績のある Claude Code 開発インフラのうち、本リポジトリに「まず」導入すべきものを特定する

---

## 1. course リポジトリのインフラ全体像

course は約 1 年かけて成熟した大規模モノレポ（pnpm + Turbo + Next.js + Supabase）で、以下の層構造で Claude 開発インフラを運用している。

| 層 | 実体 | 役割 |
|---|---|---|
| **入口文書** | `CLAUDE.md`（約 15KB） | 開発哲学 5 観点、正確性・誠実性ルール、Quick Commands、Documentation Map（詳細は `.claude/*.md` へ委譲） |
| **ガードレール** | `.claude/settings.json` | 破壊的コマンドの deny リスト（force push / reset --hard / .env 閲覧 / データ流出系 curl 等）、sandbox denyRead、hooks 登録 |
| **hooks** | `.claude/hooks/*.sh` | SessionStart（状態注入）、PreToolUse（daily-cycle 誘導、codd-commit-guard によるコミット前設計影響チェック） |
| **知識ベース** | `.claude/*.md` 約 20 本 | database / security / development-patterns 等のドメイン別規約。CLAUDE.md から表形式でリンク |
| **skills / agents** | `.claude/skills/` 50+、`.claude/agents/` 7 | /implement, /verify, /finalize-pr, /daily-cycle 等の定型ワークフロー |
| **作業場** | `.ai-workspace/` | `000` 番台 = 恒久ガイド、`yyyymmdd-NNN-<name>.md` = 日次の plan / report / progress。運用 SoT は `000-ai-progress-management-guide.mdc` |
| **定期サイクル** | `.ai-daily/` | daily / weekly / monthly のライフサイクル手順書と実行記録 JSON |
| **機械生成物** | `.ai-machine-workspace/` | plan-deep 等の機械生成物置き場（gitignore、README のみ tracked） |
| **設計統治** | `adr/` 87 本 + CoDD + TDAD | ADR ダイジェスト索引、設計書依存グラフ、テスト依存分析 |
| **PM 連携** | Linear MCP + 5 層構造 | ADR / Initiative / CoDD / plan / Issue の責務分離 |
| **MCP** | `.mcp.json` | playwright（出力先 `.ai-workspace/playwright/`）、serena、supabase（read-only）、shadcn 等 |
| **他エージェント** | `AGENTS.md`, `.gemini/`, `.cursor/` 等 | Codex / Gemini / Cursor 向けの並行整備 |

`.gitignore` には AI 生成物ポリシーがあり、`.ai-workspace/` の Markdown は **コミット対象**（ナレッジ資産）、JSON・スクリーンショット等の生成物と `.ai-machine-workspace/**` は ignore という区別を敷いている。

## 2. waveVisualizer の現状ギャップ

| 項目 | 現状 |
|---|---|
| CLAUDE.md | ✅ あり（本日、実装と同期済み） |
| .ai-workspace / .ai-machine-workspace | ⚠️ ディレクトリのみ存在、中身なし・運用ガイドなし |
| .gitignore | ❌ なし（.DS_Store も AI 生成物も無防備） |
| .claude/（settings.json, hooks, skills） | ❌ なし |
| package.json / lint / format / test | ❌ なし（vanilla JS 4 ファイル、ビルド不要の静的アプリ） |
| CI（GitHub Actions） | ❌ なし（remote は github.com:masnak/waveVisualizer あり） |
| MCP 設定 | ❌ なし |
| 検証手段の文書化 | ❌ なし（マイク必須の Web Audio アプリなのに起動・検証手順が未定義） |

## 3. 導入優先度

### P0 — まず導入すべきもの（即日・低コスト・course からほぼ流用可）

1. **`.ai-workspace/000-ai-progress-management-guide.mdc` の移植**
   course の同名ファイルをコピーし、Supabase/RLS 等モノレポ固有のチェック項目を削って軽量化する。
   `yyyymmdd-NNN` 命名規則・plan/progress の 1 対 1 対応・エラー記録テンプレートの SoT がリポジトリ内に自己記述され、どのセッションでも同じ運用になる。**今回の本レポートの命名規則自体がこのガイド由来**であり、最初に固定する価値が最も高い。

2. **`.gitignore` の新設**
   最低限: `.DS_Store`、`.ai-workspace/*.json`、`.ai-workspace/playwright/`、`.ai-machine-workspace/**`（`!README.md`）、`logs/`、`tmp/`。
   course の「AI workspace generated artifacts」セクションがそのまま雛形になる。Markdown ナレッジは commit、機械生成物は ignore、という区別を最初から敷く。

3. **`.claude/settings.json` の新設（deny リストのみで開始）**
   course の deny リスト（`git push --force` / `git reset --hard` / `.env` 閲覧 / `curl --data @` 系）は**プロジェクト非依存でそのまま流用可能**。hooks・env は空で開始し、必要になってから足す。導入コストは 1 ファイルのコピーで、事故防止効果が最も大きい。

4. **CLAUDE.md への「開発・検証」セクション追記**
   現在の CLAUDE.md は機能説明に寄っており、エージェントが自走するための運用情報がない。以下を追記する:
   - 起動: `python3 -m http.server 8000`（または `npx serve`）— file:// ではマイク権限が取れないため localhost 必須
   - 検証: Chromium のフェイクデバイスフラグ（`--use-fake-device-for-media-stream --use-fake-ui-for-media-stream`）でマイク許可ダイアログなしに自動検証できること
   - 応答言語（日本語）と、.ai-workspace 運用ガイドへのリンク

### P1 — 次の一手（最初の 1〜2 週間）

5. **ブラウザ自動検証の整備（本リポジトリ特有の最重要インフラ）**
   このアプリは「マイク → 録音 → FFT → 合成再生」という UI 操作でしか検証できず、テストコードだけでは品質を担保できない。course の `.mcp.json` の playwright 設定（allowed-origins を `http://localhost:8000` に、出力先 `.ai-workspace/playwright/`）を移植するか、gstack の /browse・/qa スキルを標準検証手順として CLAUDE.md に明記する。

6. **package.json + Prettier（+ ESLint flat config）の最小構成**
   型チェックはないが、整形と基本 lint はエージェント編集の安全網になる。`scripts`: `serve` / `lint` / `format` の 3 つで十分。

7. **GitHub Actions で lint チェック**
   remote があるので、push 時に Prettier/ESLint チェックを回す 20 行程度の workflow を 1 本。course の verify:workspace のような多段パイプラインは不要。

### P2 — 現時点では過剰（規模が育ってから）

| 見送るもの | 理由 |
|---|---|
| ADR 体系（adr/ + digest + 索引） | 4 ファイルの規模では設計判断は .ai-workspace の日次レポートで足りる |
| CoDD / TDAD / codd-commit-guard hook | 設計書依存グラフ・テスト依存分析は管理対象が数十ファイルを超えてから |
| .ai-daily（daily/weekly/monthly cycle） | 依存パッケージがなく棚卸し対象が存在しない |
| Linear PM 5 層構造 | 個人の実験リポジトリに Issue トラッキング層は不要 |
| skills / agents の大量移植 | course の skills はモノレポ固有。汎用スキル（gstack 等）はユーザーレベルで既に利用可能 |
| serena / supabase MCP | コードベースが小さく symbol 検索も DB も不要 |
| AGENTS.md ほか他エージェント設定 | Claude Code のみで開発するなら後回しで良い |

## 4. 流用可否まとめ

| course の資産 | 判定 | 備考 |
|---|---|---|
| `.ai-workspace/000-ai-progress-management-guide.mdc` | ◎ そのまま（軽量化推奨） | P0-1 |
| `.gitignore` の AI 生成物セクション | ◎ そのまま | P0-2 |
| `.claude/settings.json` の deny / sandbox | ◎ そのまま | P0-3（hooks は外す） |
| `.mcp.json` の playwright 設定 | ○ 要適合 | port・origin を差し替え |
| CLAUDE.md の構成様式（哲学 → ルール → Quick Commands → Map） | ○ 様式のみ参考 | 内容は本リポジトリ固有 |
| hooks / skills / agents / ADR / CoDD / .ai-daily | △ 見送り | P2 |

## 5. 推奨アクション（次の一歩）

1. P0 の 4 項目を 1 コミットずつ導入する（合計 30 分程度）
2. 導入後、ユーザーレベルの `/harness-review` スキルで CLAUDE.md・.claude/ 構成の整合レビューを実施する
3. P1-5（ブラウザ自動検証）を最初の機能開発と同時に整備し、「変更 → localhost 起動 → フェイクマイクで録音〜解析を通す」検証ループを確立する

---

**結論:** 最初に導入すべきは大掛かりな仕組みではなく、(1) 進捗管理ガイド（命名規則の SoT）、(2) .gitignore、(3) settings.json の deny リスト、(4) CLAUDE.md への起動・検証手順追記、の 4 点。course のインフラのうちこの 4 点だけがリポジトリ規模に依存せず即効性があり、いずれも course から流用してその日のうちに揃えられる。
