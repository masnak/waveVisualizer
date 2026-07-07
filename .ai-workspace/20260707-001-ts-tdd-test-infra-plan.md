# TypeScript + TDD テスト環境整備 計画書

作成日: 2026-07-07
対象: リポジトリ全体の TypeScript 移行と TDD テスト基盤（Vitest / Playwright / ESLint / CI）の整備
参照: CLAUDE.md / `.ai-workspace/20260707-000-claude-dev-infra-adoption-report.md` / `.ai-workspace/20260707-002-ts-tdd-test-infra-plan-review.md`（Phase 7 実装前最終レビュー）
ステータス: 最終版（2026-07-07 ユーザー承認済み・Phase 7 レビュー指摘反映済み。実装は別途指示で開始）

---

## Development Philosophy Check

- **堅牢**: 特性化 E2E（現行実挙動を固定、複数回観測で安定確認）+ golden-vector（M2 冒頭に前倒し）の二重安全網。Linux headless の単一失敗点は CI-smoke を M1 序盤に前倒しして最初に踏む。フィクスチャはコミットして決定性を担保
- **セキュア**: devDependencies は 9 パッケージに限定、lockfile + `npm ci`。CI は `permissions: contents: read` の最小権限、Actions は版指定、secrets 不使用
- **明快**: 純粋関数と副作用の依存方向を内向きに固定。ESM 移行は window ブリッジ方式で中間状態を常に動作可能に保つ。console.error allowlist は実観測 1 パターンの厳密列挙
- **修正容易**: 2 マイルストーン管理で M1 完了時点で価値が自己完結。ファイル単位の段階移行で各ステップ E2E グリーンをゲート化。整形はロジック変更と分離した単独コミット

## 0. 冒頭まとめ

### 0.1 目的

- 現行の vanilla JS アプリ（4 ファイル・計約 1,536 行）を TypeScript（strict）に移行し、型安全な開発基盤を作る
- Vitest（ユニット）と Playwright（E2E、フェイクマイク）を導入し、TDD サイクル（Red → Green → Refactor）を回せる状態にする
- ESLint / Prettier / CI を整備し、回帰を自動検出できるようにする

### 0.2 現在の問題

> 注記（B3）: 本セクションの行番号は 2026-07-07 時点のスナップショット。実装着手時は grep で再取得し、行番号を信頼しないこと。

- テスト基盤がゼロ（package.json すら存在しない）。検証手段は手動ブラウザ操作のみ
- 4 ファイルすべてが classic script（ES modules 非使用）で、全識別子がグローバル共有
  - `audioContext` / `recordedChunks` / `showStatusMessage`（main.js 定義）を sinewaveAnalyser.js が暗黙参照
  - `window.analyserSettings`（main.js）を spectrumVisualizer.js が参照
  - 選択状態はチェックボックスの `.checked`、再生ハンドルは DOM 要素プロパティ（`event.target.sineWavePlayer`）に格納され、状態が DOM に散在
- main.js と sinewaveAnalyser.js はロード時に `getElementById` + `addEventListener` を即実行 → import しただけで DOM 副作用が走り、ユニットテストが不可能
- DFT・窓関数・閾値・加算合成・正規化などの純粋計算が、DOM 読み取り / AudioContext / グローバル代入と同一関数内に混在（`analyseRecording` に DFT が埋没）
- `drawWaveform` / `drawSpectrum` は rAF ハンドル未保存の自己ループで、テストから停止不能。再呼び出しでループが多重化する潜在バグもある（初期化ボタン連打で発火しうる）
- `calculateSynthesisWaveform` は `sampleRate = 44100` をハードコード、音声パスは実 `audioContext.sampleRate` を使用という既知の不一致がある
- 音声パスは test-wave を収集せず、表示パスは収集するという**意図された非対称**がある（選択収集ロジックは「重複」ではない）
- **GitHub Pages でライブ公開中**（`gh api repos/masnak/waveVisualizer/pages` で確認済み: `build_type: legacy`, `source: {branch: main, path: /}`, `https://masnak.github.io/waveVisualizer/`）。`main` への push を配信トリガーとするレガシー方式のため、`index.html` が素の classic script 直参照である現状構成に配信が完全に依存している

### 0.3 原因

- ビルド不要の静的構成を優先した結果、モジュール化・関心分離が設計要件に含まれてこなかった
- 検証がすべて手動ブラウザ確認だったため、テスト容易性（純粋関数の分離、副作用の隔離、状態の明示化）が構造に反映されていない

### 0.4 解決方針

- **2 マイルストーン管理**: M1（テスト基盤 + 特性化安全網 + CI）だけで価値が自己完結し、中断しても安全に再開できる。M2（リファクタ + TS 完全移行）は M1 の安全網の上で実施
- **安全網を先に張ってから動かす**: 現行 JS アプリのまま Playwright の特性化テストを最初に作成する。「理想の挙動」ではなく**現行コードの実挙動を複数回観測して固定**する（ズレ・バグは記録のみで本計画では修正しない）
- **最大の技術リスクを最初に踏む（ローカルと CI の両方で）**: headless での「フェイク WAV → MediaRecorder → decodeAudioData」往復が E2E 全体の単一失敗点。ローカルでは通しシナリオの前に最小スモークを単独緑化し、**Linux 環境差は CI-smoke を M1 序盤（M1-3）に前倒し**して検証する
- **golden-vector を M2 の最初のアクションに前倒し**: dsp.ts は born-ESM の独立モジュールとして、アプリの ESM 化**前**に作成・テスト固定できる（Vitest はアプリの module 形式に依存しない）。以降の全リファクタ（ESM 化含む）を golden 網の下で行う
- **ESM 化は window ブリッジ方式**: classic と module の共存中間状態を動作可能に保つため、変換済み module は移行期間中 `window.X = X` でグローバル露出し、消費側の変換完了後にブリッジを除去する。これで「1 ファイルずつ E2E グリーン」が実際に成立する
- 純粋計算を副作用から分離抽出し、Vitest で**テストファースト**検証。DOM からの選択収集はプレーンデータを受ける純関数にして node 環境でテスト（jsdom 不使用）
- 副作用（DOM / AudioContext / rAF）は `init()` 関数化・AppContext 注入・停止可能な描画ループで隔離する

### 0.5 実装方針

- スモールステップ（1 ステップ = 1 つの検証可能な変更）。各ステップの完了ゲートは「特性化 E2E グリーン + それまでに作成したユニットテストグリーン」
- テスト基盤導入後の新規コード（抽出モジュール含む）は最初から `.ts`（born-typed）でテストファーストで書く
- 挙動の保存を最優先とし、発見した既存バグは修正せず進捗ログに記録して別計画へ回す
- **ドキュメントは随時更新**: 開発コマンド等が変わったステップの直後に CLAUDE.md の該当箇所を更新する
- **例外として認める挙動変更（すべて記録・分類する）**: ①audioContext 待ちポーリングへのタイムアウト付与（timeout 時は **resolve**＝現行の続行と等価、reject にしない）、②rAF ループの start/stop 化（多重ループ潜在バグの解消＝明示的な設計改善として分類）、③index.html への `<link rel="icon" href="data:,">` 追加（favicon 404 による console.error 汚染の除去、アプリ挙動に無影響）

### 0.6 解決後のフロー説明（簡潔）

1) `npm run dev` で Vite dev server 起動（`python3 -m http.server` を置換）
2) `npm test` で Vitest ユニットテスト、`npm run test:e2e` で Playwright E2E（ローカルは dev server 対象で高速反復、フェイクマイク自動）
3) 新機能・修正はテストファースト（Red → Green → Refactor）
4) push / PR 時に GitHub Actions で typecheck / lint / format:check / unit / E2E を自動実行（M2 完了後は build + preview 検証込み）

---

## 1. 仕様決定（推奨案を明示）

### 1.1 決定事項（技術スタック）

| 領域 | 決定 | 根拠（4 観点の要約） |
|---|---|---|
| 言語 | TypeScript 5.x（**最初から** strict。`noUncheckedIndexedAccess` は **off**） | 堅牢: null 安全を型で強制 / 明快: DSP ループの境界ガード強制は摩擦 > 実益（後から有効化可能） |
| dev server / ビルド | Vite | index.html エントリで現構成と親和・TS 変換ゼロ設定・Vitest と設定共有 |
| ユニットテスト | Vitest（**node 環境のみ**。jsdom 不使用） | 純粋関数テストに DOM 不要。`test` スクリプトは **`vitest run`**（watch は `test:watch`） |
| E2E | Playwright（Chromium のみ、フラグは `use.launchOptions.args`。**2 プロジェクト構成: tone / silence**） | ローカル = dev server 対象（TDD 回転速度優先）、CI = build + preview 対象（M2-8 で切替）。特性化は **Chromium 固有挙動の固定**であることを明記 |
| lint / format | ESLint（typescript-eslint、**flat config、scope 分離**）+ Prettier（`.prettierignore` 整備） | レガシー `.js` は `sourceType: script` + browser globals + 最小ルール、新規 `.ts` のみ厳格 + `--max-warnings=0`。未定義グローバル検出は `tsc` が担う |
| CI | GitHub Actions（**2 段構成**: CI-smoke を M1-3 に前倒し、CI-full は M1-6。最小 + retries + artifact） | Linux headless の単一失敗点を早期に踏む。除外は Playwright **ブラウザバイナリ**キャッシュ / concurrency / coverage ゲート（setup-node の npm 依存キャッシュは 1 行なので含める） |
| coverage | `@vitest/coverage-v8` を **report-only** で使用（`test:coverage`、ゲートなし） | golden-vector + 解析的テストが既に厚く、独立ゲートが守るものは薄い |
| パッケージ管理 | npm（lockfile コミット、CI は `npm ci`）、Node は `.nvmrc` で `24` に固定 | ローカル（Node 24.15.0）と CI の環境差を排除（patch までの厳密固定は不要と判断） |
| 本番配信（GitHub Pages） | レガシー配信（`source: main:/`）から **GitHub Actions ベースのデプロイ**（`actions/upload-pages-artifact` + `actions/deploy-pages`、リポジトリ Pages Source を "GitHub Actions" に切替）へ移行。`vite.config` に `base: '/waveVisualizer/'` を設定 | 現行構成は `main` への push でルート直下の classic script を素配信しており、M2-8 の `src/` 物理移動と ESM 化で確実に破壊される（実装前レビューで発見）。dist/ を明示的にデプロイする方式へ切替えないと、テスト基盤整備の過程で公開中のライブデモが壊れるという部分最適の典型的失敗になる |

補足:
- Web Audio API / MediaDevices の型は TS 標準 DOM lib に含まれる。追加の型パッケージ不要
- tsconfig は**2 分割**: `tsconfig.json`（src 用: `target: ES2022` / `module: ESNext` / `moduleResolution: bundler` / `lib: [ES2022, DOM, DOM.Iterable]` / `strict: true` / 移行中のみ `allowJs: true, checkJs: false`）と `tsconfig.node.json`（vite.config / playwright.config / e2e 用）。M1-2 の E2E spec（.ts）は Playwright 内蔵変換で実行可、`tsc` 型検査は M1-4 から効く
- ユニットテストで AudioContext / canvas 描画はテストしない（解析は decodeAudioData 後の PCM への自前 DFT のため OfflineAudioContext も不要）
- devDependencies（**9 個**に限定）: `typescript` `vite` `vitest` `@vitest/coverage-v8` `@playwright/test` `eslint` `typescript-eslint` `prettier` `eslint-config-prettier`
- npm scripts 体系: `dev` / `build` / `preview` / `test`（`vitest run`）/ `test:watch` / `test:coverage` / `test:e2e` / `lint`（`--max-warnings=0`、scope 分離前提）/ `format`（`--write`）/ `format:check` / `typecheck`（`tsc --noEmit`）

### 1.2 目標ディレクトリ構成（M2 完了時）

```
index.html                 # Vite エントリ（<script type="module" src="/src/main.ts">）+ data: favicon
.nvmrc                     # 24
src/
  main.ts                  # エントリ: DOMContentLoaded で init()（readyState ガード付き＝発火済みなら即実行）
  types.ts                 # FrequencyComponent / AnalysisResult 等の共有型（早期に定義）
  state.ts                 # セッション状態ストア（設計は 1.4-A）
  audio/
    dsp.ts                 # 純粋: ハミング窓 / DFT / 動的閾値 / 8kHz フィルタ / dB 変換 ← golden-vector（M2 冒頭で作成）
    signal.ts              # 純粋: 正弦波サンプル生成 renderSineSamples()
    synthesis.ts           # 純粋: 音声パス / 表示パス（別関数のまま）
    analyser.ts            # 副作用側: decodeAudioData → dsp 呼び出し → AnalysisResult を戻り値で返す
    playback.ts            # 薄いシェル: createBuffer + copyToChannel + start のみ
  visualizers/
    waveVisualizer.ts      # start/stop 契約: rafId 保存 + cancelAnimationFrame + running フラグで start 冪等化
    spectrumVisualizer.ts
    synthesisWaveVisualizer.ts
  ui/
    sineWaveList.ts        # displaySineWaves / チェックボックスハンドラ / DOM 読み取りの薄いシム
    status.ts              # showStatusMessage
  **/*.test.ts             # ユニットテスト（実装と同居、全て node 環境）
e2e/
  workflow.spec.ts         # スモーク + 通しシナリオ + ブランチ（baseURL + 相対 goto で環境非依存に）
  fixtures/
    tone-440hz.wav         # コミット（仕様は 1.4-C）
    silence.wav            # 「解析 0 件」ブランチ用（仕様は 1.4-C）
    generate-tone.mjs      # 再生成用スクリプト
```

- `collectSelectedComponents` は DOM 要素ではなく**プレーンデータを受ける純関数**。ただし「2 箇所の重複統合」ではなく**「共通選択ロジック + `includeTestWaves` パラメータ」**として抽出する（音声パス = false / 表示パス = true。現行の意図された非対称を保存）
- ファイルの root → `src/` 物理移動は M2-8（ESM 化）の一部として実施

### 1.3 確定事項（2026-07-07 ユーザー確認済み）

**Phase 2（仕様確定）:**

- **Q1 スコープ** → **リファクタまで含める**（挙動は特性化 E2E + golden-vector で保証）
- **Q2 dev server** → **Vite 採用**
- **Q3 CI** → **薄く含める**（Chromium のみの最小構成）
- **Q4 デバッグログ** → **挙動維持**（ログ整理は別計画。error チャネルのみ担保、log/info/warn の量的維持は非保証）

**Phase 5（PM 精査後のユーザー確定）:**

- **CI 構成** → 最小 + retries + artifact upload
- **進め方** → **2 マイルストーン管理**
- **スリム化（全採用）** → coverage report-only / jsdom 排除 / `noUncheckedIndexedAccess` off / 境界値テストは 8kHz 境界のみ
- **ローカル E2E** → dev server 対象。build + preview 検証は CI のみ（M2-8 で切替）

### 1.4 レビューで確定した設計決定

> 注記（B3）: グローバル対応表（audioContext / recordedChunks / showStatusMessage / window.analyserSettings / frequencyComponents / maxAnalysisAmplitude / synthesizedBuffer）は移行の**起点マップ**であり網羅保証ではない。抜けは `tsc --noEmit` / Vite build エラーで検出する。main.js の未使用 `const sampleRate = 44100`（デッドコード）は記録のみ・削除は別計画。

#### A. 状態管理の設計（state.ts はグローバル変数の引っ越しにしない）

ES modules の import 束縛は読み取り専用で、`export let` への import 側からの再代入は不可。以下の 3 分類で扱う:

1. **注入依存（サービス）**: `audioContext` / `micSoundAnalyser` / 各 visualizer インスタンスは `init()` で生成し `AppContext` として引数で渡す。**移行期の例外**: ESM 化（M2-8）と init 集約（M2-9）が audioContext で絡むため、移行期間のみ `state.audioContext`（プロパティ変更方式）で受け、**M2-11 で AppContext 純注入へ収斂**させる（達成時期を段階分離）
2. **ドメインデータの戻り値フロー**: `analyseRecording()` は `AnalysisResult`（components + maxAmplitude）を**戻り値で返し**、呼び出し側が保持する
3. **残余の共有状態**: `recordedChunks` / `synthesizedBuffer` 等は `export const state = {...}` の**プロパティ変更方式**。裸の `export let` は使用禁止
4. 再生ハンドルは DOM 要素プロパティから `Map<index, player>` へ移す（M2-11）。選択状態（`.checked`）は DOM 所有のままとし、読み取りシムで境界を 1 箇所に固定

#### B. 「コンソールエラーゼロ」の定義（特性化テストの合否基準）

- **ハード assert**: 未捕捉例外（`page.on('pageerror')`）= 0 件
- **console.error**: allowlist 除外後 0 件。allowlist は**実観測に基づく厳密列挙のみ**（現時点の候補は spectrumVisualizer の `🚨 20kHz超` 診断 **1 パターンのみ**。「絵文字接頭辞なら許容」のような包括条件は禁止 — 絵文字なしの console.error は全て本物の失敗シグナルであり、将来の実エラーをマスクしない）。M1-2 の初回実行で実際の出力を採取して確定し、推測で追加しない
- **favicon 404 対策**: index.html に `<link rel="icon" href="data:,">` を追加し、サブリソース 404 由来の console error を発生源から除去（挙動無影響、0.5 の例外③）
- **console.warn / info / log / debug**: assert 対象外

#### C. フィクスチャ仕様（決定的 E2E の前提）

- **tone-440hz.wav**: 16-bit signed PCM / mono / 48000Hz / 振幅 ~0.5 / 長さ ≥3 秒 / 端に短いフェード / DC 成分ゼロ。Chromium はこの形式以外を無言で無視しフォールバックする
- **silence.wav**（Phase 6 で追加）: 「解析 0 件 → test-wave 表示」ブランチ用。M1-2 の観測で**実際に 0 成分になることを確認してから採用**（Opus 経由の数値ノイズが動的閾値の下限 1e-8 を超える場合は 0 にならない）。0 にできない場合はこのブランチを「E2E 検証不能」と記録し、test-wave 経路を残存リスクとして進捗ログに残す
- Playwright は **2 プロジェクト構成**（`tone` / `silence`）で `launchOptions.args` の fake-audio ファイルを差し替える
- フィクスチャは生成スクリプトとともに**コミット**。ループ再生を活用（`%noloop` は付けない）
- **フィクスチャパスは動的解決必須**: `fileURLToPath(new URL('./e2e/fixtures/...', import.meta.url))` 等で config 基準の絶対パスを生成（ローカル / CI のチェックアウト先差を吸収）
- assert 許容: **±5Hz**（≈2 bin）を暫定とし、M1-2 で**複数回（5 回）観測して安定性を確認**、**最終確定は初回 CI（Linux、M1-3）**。macOS 観測値と Linux が食い違う場合は許容幅を再ピンする
- 3 フラグは `use.launchOptions.args` に配置。`--autoplay-policy=no-user-gesture-required` は**保険として仮置きし、M1-2 で「無くても通るか」を確認して不要なら外す**（本番と異なる緩和を E2E に持ち込まないため）。`grantPermissions(['microphone'])` を対象 origin に付与

#### D. E2E 待機戦略・シナリオ設計（フレーク対策）

- **固定 sleep（`waitForTimeout`）は禁止**。状態ベース待機に統一: 録音完了 =「音声再生 / 周波解析ボタンの活性化」、解析完了 = 成分リスト DOM の出現、合成完了 =「合成中...」解除 + 比較ボタン活性化、再生完了 = ステータスメッセージ
- **シナリオ設計（Phase 6 で確定）**: happy path の成分選択は「**全て選択**」（change 非発火 = 無音、100 音同時再生を回避）→ 合成再生へ。ブランチは「**個別チェックボックス → 再生 → 全て解除 → 停止**」を通す（これで auto-select と個別再生の両リスナー・両経路が init() 集約の回帰ゲートに乗る）
- **数値 pin（Phase 6 で追加・最重要補強）**: 通しシナリオで**上位 1〜3 成分のラベル文字列から「周波数 + 相対音量」を pin** する（ラベルは `${frequency.toFixed(1)} Hz - 音量: ${relativeVolume.toFixed(3)}` 形式で既に DOM にある）。これで maxAnalysisAmplitude・相対振幅の配線回帰に E2E が反応し、golden-vector 整備前の窓（M2-8/M2-9）を塞ぐ。位相はスペクトル漏れで揺れやすいため pin しない
- スモークは中間生成物も assert: `recordedChunks[0].size > 0` と `mediaRecorder.mimeType` を記録・確認（単一失敗点の切り分け解像度向上）
- 解析（同期 O(N²) DFT、約 1.3 億回反復）は低速 CI で数秒 main thread をブロックする。解析完了待ちのタイムアウトは長め（15s 目安）に明示。`test.setTimeout` は 60s、E2E 全体 budget < 90s、ユニット < 5s
- E2E は suspended → resume 分岐を通らない（autoplay 緩和下）。この盲点は進捗ログに記録し、M2-9 で resume 経路を触る際は手動ブラウザ確認を 1 回挟む

#### E. 純粋関数境界の詳細（挙動保存の要点）

- DFT は `fftSize` / `sampleRate` を**引数注入**。ユニットテストは N=256〜1024 の小サイズ + bin 中心周波数で厳密 assert
- **golden-vector が回帰のゲート**: 固定の多成分・位相付き合成信号に対する出力スナップショット（rel 1e-6）。**スナップショット対象フィールドは frequency / rawAmplitude / phase / amplitudeDB / maxAmplitude を全て含める**（周波数のみでは振幅・位相回帰を見逃す）
- 「一字一句そのまま複製」の唯一の例外は `maxAnalysisAmplitude` のグローバル書込 → ローカル変数 + 戻り値化（これ自体が意図的変換。golden が maxAmplitude を含むことで検証）
- 解析的期待値（bin 中心・振幅 A → 抽出振幅 ≈ A/2、`sin` 入力 φ=0 → 復元位相 −π/2）は実装理解の検証。現行実装と食い違えば**観測値で pin し、既存バグとして記録**
- 境界値テストは **8kHz 境界（10× 厳格化の直下・直上）のみ**
- 表示パスと音声パスの正規化は**別々の純関数のまま統合しない**。`calculateSynthesisWaveform` の `sampleRate=44100` は引数化しつつデフォルト 44100 で挙動維持
- `playSineWave` のサンプル生成ループは `signal.ts` の `renderSineSamples()` として純粋側へ
- coverage は `test:coverage` で report-only（対象: `src/audio/**`、参考数値として進捗ログに記録）

#### F. ESM 移行ブリッジ戦略（Phase 6 で追加）

classic `<script>` と ES module の共存中間状態はそのままでは動かない（module 化した瞬間、その top-level 宣言はグローバルから消え、未変換の classic 側が ReferenceError で即死する）。そこで:

- **window ブリッジ方式**を採用: 変換済み module は移行期間中 `window.WaveVisualizer = WaveVisualizer` のようにグローバルへ露出し、未変換の classic 側は現行の bare global 参照のまま動かす。消費側の変換が完了した時点でブリッジを除去する
- 変換順は葉→根: `waveVisualizer` → `spectrumVisualizer` → `sinewaveAnalyser` → `main`（最後に index.html を単一 module エントリへ）
- これにより「1 ファイル変換ごとに E2E グリーン」が機構込みで成立する
- **Vite dev の classic script 配信**は M1-4 の冒頭で単独確認する（transform を通っても global スコープ実行が維持されること）。崩れる場合の fallback: 移行期間中は 4 ファイルを `public/` 配下（無変換配信）に置く
- **注記（実装前レビューで追加）**: `<script type="module">` は `defer` 相当で HTML パース完了後まで実行が遅延される一方、未変換の classic `<script>` は文書順に同期実行される。理論上、変換途中の混在状態でこの実行順序の差が問題になり得るが、現行 4 ファイルはいずれも「他ファイルの値を読むトップレベル（同期）コード」を持たず、参照はすべてユーザー操作後のイベントハンドラ内に限られるため、本アプリでは実害が出ないことを確認済み（実装時に想定外の挙動が出た場合はこの前提から疑う）

#### G. GitHub Pages デプロイ移行戦略（実装前レビューで追加）

現行、`https://masnak.github.io/waveVisualizer/` は GitHub Pages のレガシー配信（`source: main:/`）で稼働中（README.md にライブデモとして掲載、`gh api repos/masnak/waveVisualizer/pages` で確認済み）。`main` への push を配信トリガーとし、リポジトリルートの classic script をそのまま静的配信している。M2-8 で `src/` への物理移動と ESM 化が行われた瞬間、このレガシー配信は壊れる（`.ts` ファイルの MIME type 不一致、または参照先パスの消失）。

- **対応**: M2-8 で `vite build` が初めて成功した時点（本計画 M2-8 のステップ参照）で、Pages を GitHub Actions ベースのデプロイへ切替える（`.github/workflows/deploy-pages.yml` を追加し `permissions: {pages: write, id-token: write, contents: read}` で `vite build` → `actions/upload-pages-artifact`（対象 `dist/`）→ `actions/deploy-pages` を実行。リポジトリ設定の Pages Source も "GitHub Actions" に切替える）
- **base path**: `vite.config` に `base: '/waveVisualizer/'` を設定する（プロジェクトページのサブパス配信に必須。既定の `base: '/'` のままだとビルド後のアセット参照が全滅する）
- **atomic 制約**: リポジトリルートからの静的ファイル撤去（`src/` への移動）と、Pages デプロイ方式の切替は**同一コミット/PR で atomic に行う**。順序がずれるとライブデモがダウンタイムを持つ
- 新規 npm devDependency の追加は不要（GitHub Actions のマーケットプレイスアクションのみで完結するため、1.1 節の「9 個」は変わらない）

---

## 2. 作業ステップ（2 マイルストーン・番号付き）

### M1: テスト基盤（ここまでで自己完結）

1) **M1-1: npm scaffold + Playwright 導入（コード無変更）**
   - `package.json` / `.nvmrc` 作成、`@playwright/test` 導入、**`npx playwright install chromium`（ローカルのブラウザバイナリ導入）**
   - `.gitignore` に `node_modules/` `dist/` `playwright-report/` `test-results/` `coverage/` `*.tsbuildinfo` を追記。`.prettierignore`（`dist/` `coverage/` `playwright-report/` `test-results/` `e2e/fixtures/*.wav`）作成
   - フィクスチャ生成・コミット: `tone-440hz.wav` + `silence.wav`（仕様 1.4-C）
   - 検証: `npx playwright test --list` が通る
2) **M1-2: 特性化 E2E テスト作成（現行 JS のまま、webServer = `python3 -m http.server 8000`）** ← 安全網
   - index.html に data: favicon を追加（1.4-B、唯一の許容コード変更）
   - **冒頭スモーク（最初に単独緑化）**: 初期化 → 録音 → ボタン活性化 + `recordedChunks[0].size > 0` / `mimeType` 確認。headless での録音経路（最大の単一失敗点）を検証。通らなければ E2E 戦略自体を再検討
   - 通しシナリオ（1.4-D のシナリオ設計・待機戦略に従う）: 初期化 → 録音 → 音声再生 → 周波解析 → **上位成分ラベルの周波数 + 相対音量を pin** → 全て選択 → 合成再生 → 原音比較 → 波形停止
   - ブランチ 2 本: 「個別チェック → 再生 → 全て解除 → 停止」「silence プロジェクトで解析 0 件 → test-wave 表示」（0 件にならなければ検証不能として記録）
   - **観測の複数回実行（5 回）**で ±5Hz の安定性を確認し assert を暫定固定。console.error allowlist を実観測で厳密確定。autoplay フラグの要否確認
   - 検証: 現行アプリで E2E グリーン（tone / silence 両プロジェクト）
3) **M1-3: CI-smoke 前倒し（Linux 検証、Phase 6 で追加）**
   - ubuntu-latest で **録音→decode スモークのみ**を回す最小ワークフローを push（`permissions: contents: read` / `actions/checkout@v4` / `setup-node@v4` + `.nvmrc` + `cache: npm` / `npm ci` / `npx playwright install --with-deps chromium` / `timeout-minutes: 15`）
   - macOS 観測値と Linux の突き合わせ。±5Hz 許容の**最終確定点**。ここで落ちれば M1-4 以降に投資する前に E2E 戦略を再検討
   - 検証: CI-smoke グリーン
4) **M1-4: Vite 導入（ツールチェーン交換のみ、classic script のまま）**
   - 冒頭で **classic script の無変換配信を単独確認**（1.4-F。崩れたら `public/` fallback）
   - Vite 導入、`tsconfig.json` + `tsconfig.node.json` 作成（最初から strict + allowJs）
   - Playwright webServer を `npm run dev` に切替（port 固定・`reuseExistingServer: !CI`、spec は baseURL + 相対 goto で無修正のまま）
   - **注意（B1）**: classic script のままでは `vite build` は成立しない。build + preview の検証は M2-8 まで行わない
   - CLAUDE.md の起動コマンド記述をこのステップ直後に更新。README.md の「ローカル実行方法」節（`python3 -m http.server` 記述）も同時に `npm run dev` へ更新する。**観測基準値・console allowlist が Vite dev 配信でも成立することを再確認**
   - 検証: E2E グリーン
5) **M1-5: Vitest + ESLint + Prettier 導入**
   - `vitest` 設定（node 環境）、ESLint flat config（**scope 分離**: レガシー `.js` は `sourceType: script` + browser globals + 最小ルール or 対象外、`.ts` のみ厳格 + `--max-warnings=0`）、Prettier
   - **全ファイル一括整形はロジック変更と分離した単独コミット**
   - 検証: サンプルテスト 1 件 + `lint` / `format:check` / `typecheck` が通る
6) **M1-6: CI-full 構築（最小 + retries + artifact）**
   - M1-3 のワークフローを拡張: `push`（main）+ `pull_request` トリガ、`typecheck` / `lint` / `format:check` / `test` / `test:e2e`（dev server 対象）
   - フレーク対策: `retries: CI ? 2 : 0`、`use: { trace: 'on-first-retry', screenshot: 'only-on-failure' }`、`reporter: [['github'], ['html', {open: 'never'}]]`、失敗時 `playwright-report/` `test-results/` を `upload-artifact@v4`。**retry で通ったテストはレポートで可視化しトリアージ対象にする**（黙って飲み込まない）
   - 入れないもの（後追い可）: Playwright ブラウザバイナリキャッシュ / concurrency キャンセル / coverage ゲート
   - 検証: GitHub 上で全ジョブグリーン
   - **← M1 完了。テスト基盤 + 安全網 + CI が揃い、ここで中断しても価値が確定**（注: M1 は build 未検証 = M2-8 で担保。「基盤が揃った」証明であり「出荷可能」ではない）

### M2: リファクタ + TypeScript 完全移行

7) **M2-7: dsp.ts 抽出 + golden-vector 固定（Phase 6 で前倒し。アプリ未接続の独立モジュール）**
   - DFT ループ・ハミング窓・動的閾値・8kHz フィルタ・dB 変換を**そのまま** `src/audio/dsp.ts`（born-ESM）へ複製（fftSize / sampleRate は引数注入。唯一の変換は maxAmplitude のグローバル書込 → 戻り値化）
   - golden-vector（スナップショット対象: frequency / rawAmplitude / phase / amplitudeDB / maxAmplitude、rel 1e-6）+ 解析的期待値 + 8kHz 境界テストを作成しグリーン確認
   - この時点ではアプリは dsp.ts を参照しない（差し替えは M2-8 の sinewaveAnalyser 変換時）
   - 検証: ユニットテストグリーン（以降の全リファクタが golden 網の下に入る）
8) **M2-8: state 設計導入 + ES modules 化（window ブリッジで葉→根 1 ファイルずつ）+ src/ 移設**
   - `types.ts` / `state.ts`（1.4-A）を先に作成 → 1.4-F のブリッジ方式で `waveVisualizer` → `spectrumVisualizer` → `sinewaveAnalyser` → `main` の順に変換・`src/` へ移設。**sinewaveAnalyser 変換時に `analyseRecording` を dsp.ts 呼び出しへ差し替え**（golden + ラベル pin が守る）。audioContext は移行期 `state.audioContext` 方式（1.4-A）
   - 各ファイル変換ごとに E2E グリーン確認。最後に index.html を単一 module エントリ化しブリッジ除去
   - 完了後: `vite build` 成功を確認し、**CI の E2E を build + preview 対象に切替**。**観測基準値・待機条件・allowlist が bundled build でも成立することを再検証**
   - **GitHub Pages 対応（1.4-G、実装前レビューで追加）**: `vite.config` に `base: '/waveVisualizer/'` を設定。`.github/workflows/deploy-pages.yml` を追加し `vite build` → `actions/upload-pages-artifact`（`dist/`）→ `actions/deploy-pages` でデプロイ、リポジトリ Pages Source を "GitHub Actions" に切替。**この対応は `src/` へのファイル物理移動と同一コミット/PR で atomic に行う**（順序がずれるとライブデモ `https://masnak.github.io/waveVisualizer/` がダウンタイムを持つ）
   - 検証: E2E グリーン（build + preview 対象）+ Pages 切替後にライブ URL が 200 で応答し主要ワークフローが手動で通ることを確認
9) **M2-9: ロード時副作用の init() 集約**
   - main と sinewaveAnalyser **両方**のリスナー登録を `init()` へ。`main.ts` は DOMContentLoaded + **readyState ガード**（発火済みなら即実行）で自動起動を保持。audioContext 待ちポーリングにタイムアウト付与（**timeout 時は resolve**、1.4-D）。resume 経路は手動ブラウザ確認 1 回
   - 検証: E2E グリーン
10) **M2-10: 合成系純粋関数の抽出**: `synthesis.ts` / `signal.ts` / 選択収集
    - `renderSineSamples`（signal.ts）、音声パスと表示パスを**別関数で**抽出（1.4-E）。テストファースト
    - `collectSelectedComponents` を **`includeTestWaves` パラメータ付き**の純関数として抽出（1.2。表示 = true / 音声 = false の非対称を保存）し、node 環境でユニットテスト
    - 検証: ユニット + E2E グリーン
11) **M2-11: 全ファイル .ts 化 + allowJs off + 副作用隔離の仕上げ**
    - 残りの `.js` を `.ts` 化 → `allowJs` を無効化
    - visualizer の rAF ループを start/stop 契約に変更（**挙動保存ではなく多重ループ潜在バグ解消の設計改善として分類・記録**）、再生ハンドルを `Map` へ、`state.audioContext` を廃止し **AppContext 純注入へ収斂**（1.4-A の原則達成点）
    - 検証: `tsc --noEmit` エラーゼロ、ユニット + E2E グリーン
12) **M2-12: 最終ドキュメント同期 + クローズ**
    - CLAUDE.md（プロジェクト構成・検証ループ・技術仕様の残り）/ README 更新
    - `test:coverage` の参考数値、発見した既存バグ一覧（rAF 多重化 / sampleRate 不一致 / デッドコード / E2E 盲点＝suspended 経路・test-wave 経路等）を進捗ログに記録
    - 検証: CLAUDE.md 記載のコマンドが実際に動く

---

## 3. 完了基準（Done）

### M1 完了基準

- 特性化 E2E（スモーク + 通し + ブランチ 2 本、tone / silence 両プロジェクト）が現行挙動のままグリーン
- 未捕捉例外ゼロ・console.error（厳密 allowlist 除外後）ゼロ・上位成分の周波数（±5Hz、初回 CI で最終確定）+ 相対音量が pin 済み
- `npm run dev` で起動し、主要ワークフローが手動でも通る
- `lint` / `format:check` / `typecheck` / `test`（サンプル）が通る
- GitHub Actions（CI-smoke → CI-full）が push / PR で全チェックグリーン
- CLAUDE.md の起動コマンドが実態と一致。README.md の「ローカル実行方法」節も `npm run dev` に更新済み（M1-4）
- 注記: M1 では `vite build` は未検証（M2-8 で担保）。特性化は Chromium 固有挙動の固定

### M2 完了基準

- dsp / synthesis / signal の純粋関数に対する Vitest ユニットテストがグリーン（golden vector〔5 フィールド〕+ 解析的期待値 + 8kHz 境界）
- `collectSelectedComponents`（includeTestWaves パラメータ付き）の node 環境ユニットテストがグリーン
- `tsc --noEmit`（strict、allowJs off）・`lint --max-warnings=0`・`format:check` がエラーゼロ
- `vite build` が成功し、CI の E2E が build + preview 対象でグリーン
- window ブリッジが全て除去され、`state.audioContext` が廃止され AppContext 注入に収斂している
- **GitHub Pages ライブデモ（`https://masnak.github.io/waveVisualizer/`）が GitHub Actions ベースのデプロイへ移行済み、URL が 200 で応答し初期化〜録音〜解析〜合成再生が手動で通る**（1.4-G、M2-8 と atomic）
- テスト実行時間: ユニット < 5s / E2E < 90s 目安
- CLAUDE.md / README が新しい開発フロー・構成と一致
- 発見した既存バグ・E2E 盲点・意図的挙動変更（0.5 の例外①〜③）が進捗ログに記録されている
- 進捗ログ（`progress-20260707-001-*.md`）更新済み

---

## レビュー履歴

### Phase 3（2026-07-07 専門エージェントレビュー、4 名・model: opus）

| レビュアー | 主要指摘 | 対応 |
|---|---|---|
| Software Architect | 【高】state.ts がグローバル引っ越しになる /【高】選択状態の DOM 散在 /【高】ステップ big-bang /【高】strict 化タイミング矛盾 /【中】特性化が理想値を固定するリスク 他 | 1.4-A、ステップ分割、strict 最初から on、実挙動観測方式に反映 |
| Frontend Developer | 【高】export let 再代入不可 /【高】コンソールエラー定義が診断ログと衝突 /【高】WAV 16-bit PCM 制約 /【中】init() 両ファイル・rAF 契約・build 検証・待機戦略 他 | 1.4-A/B/C/D、build 検証、整形単独コミットに反映 |
| Test Results Analyzer | 【高】golden-vector 必要 /【高】console 定義 /【高】DFT サイズ注入・解析的期待値 /【高】±5Hz 許容 /【中】選択収集純粋化・カバレッジ限定 他 | golden-vector 手順、1.4-B/C/E、budget 明記に反映 |
| DevOps Automator | 【高】playwright install 欠落 /【高】vitest watch 地雷・npm ci /【高】Node 固定 /【高】retries・artifact 他 | CI 具体化、`vitest run` + `.nvmrc`、フィクスチャコミットに反映 |

**矛盾裁定**: WAV `%noloop` → ループ活用を採用（録音 2 秒に連続トーンが必要、定常入力は決定性に有利）。

### Phase 5（2026-07-07 PM 精査: plan-pm・model: opus。判定「要調整（条件付き承認可）」→ ユーザー確定で解消）

| 分類 | 指摘 | 対応 |
|---|---|---|
| 過剰 A〜F | CI ハードニング超過 / coverage ゲート / jsdom / DFT 安全網四層 / noUncheckedIndexedAccess / ローカル毎回 build | ユーザー確定で全スリム化（1.3 Phase 5 参照） |
| 運用 | 2 マイルストーン分割 | 採用（M1 で価値自己完結） |
| ブロッカー B1 | classic script のまま vite build 不可 | dev 対象維持、build+preview 切替を ESM 化後へ |
| ブロッカー B2 | headless 録音経路が最大の単一失敗点 | スモーク先行を明記 |
| 注記 B3 | 行番号・対応表の陳腐化 | 注記追加、ドキュメント随時更新原則へ |

### Phase 6（2026-07-07 実装前最終レビュー、4 名・model: opus。全員「条件付き着手可」→ 条件を本版に反映済み）

| レビュアー | 主要指摘 | 対応 |
|---|---|---|
| Software Architect | 【中高】「解析 0 件」ブランチが 440Hz フィクスチャでは到達不能 /【中高】選択収集は重複でなく意図された非対称（test-wave 包含差）/【中】golden を M2 冒頭へ前倒し可能（born-ESM は アプリ ESM 化に非依存）/【中】ESM 化と init 集約が audioContext で絡む /【中】±5Hz は初回 CI で最終確定 /【中】rAF start/stop は挙動変更として分類 /【低】ローカル playwright install・ポーリング timeout=resolve・allowlist は実観測限定 | silence.wav + 2 プロジェクト（1.4-C）、includeTestWaves パラメータ化（1.2/M2-10）、golden 前倒し（M2-7）、移行期 state.audioContext → M2-11 収斂（1.4-A）、0.5 例外分類、M1-1/1.4-D に反映 |
| Frontend Developer | 【高】Vite dev の classic script 無変換配信は要検証（fallback: public/）/【高】favicon 404 が console.error を汚す /【中】APM（AGC/NS）による観測揺れ → 複数回観測 /【中】スモークに blob size・mimeType assert /【低】autoplay フラグの要否確認・baseURL 統一・src/ 移設タイミング・E2E spec の型検査時期 | 1.4-F 検証手順 + fallback、data: favicon（1.4-B/0.5 例外③）、5 回観測（1.4-C）、スモーク強化（1.4-D）、M1-4/M2-8 に反映 |
| Test Results Analyzer | 【高】test-wave 3 経路が E2E 未カバー（0 件ブランチ到達不能）/【高】ESM 移行ブリッジ戦略欠落 /【中】maxAnalysisAmplitude 配線回帰が ±5Hz に映らない → **ラベル DOM の周波数 + 相対音量 pin（最重要補強）** /【中】シナリオ設計（happy = 全て選択 / ブランチ = 個別再生 → 全解除）/【中】golden スナップショットに振幅・位相・dB・maxAmplitude を含める /【低】suspended 経路の盲点記録 | silence フィクスチャ、1.4-F、ラベル pin（1.4-D）、シナリオ確定（1.4-D）、golden 5 フィールド（1.4-E）、盲点記録（M2-12）に反映 |
| DevOps Automator | 【高】permissions: contents: read 欠落 /【高】lint --max-warnings=0 がレガシー JS で破綻 → scope 分離 /【中高】Linux headless の初検証が M1 末尾は「最大リスク最初に」と矛盾 → CI-smoke 前倒し /【中】フィクスチャ絶対パス動的解決・trace/screenshot 設定・cache 文言矛盾・retry 可視化 /【低】checkout/upload-artifact 版指定・timeout-minutes・.prettierignore | CI-smoke を M1-3 に新設、ESLint scope 分離（1.1/M1-5）、動的パス解決（1.4-C）、trace 設定・retry トリアージ（M1-6）、cache 文言統一（1.1）、版指定・timeout・.prettierignore（M1-1/M1-3）に反映 |

### Phase 7（2026-07-07 実装前最終レビュー、単一エージェント通しレビュー・model: sonnet。一貫性確保のため分業でなく単独で全観点を通し確認。判定「Pages 対応を明記の上で着手可」）

実コード全文（index.html / main.js / waveVisualizer.js / spectrumVisualizer.js / sinewaveAnalyser.js）との突合、および `gh api` による GitHub Pages 実設定の確認を実施。詳細は `20260707-002-ts-tdd-test-infra-plan-review.md` 参照。

| 観点 | 主要指摘 | 対応 |
|---|---|---|
| 抜け漏れ（重大） | 【重大】`https://masnak.github.io/waveVisualizer/` が GitHub Pages レガシー配信（`source: main:/`）で稼働中と `gh api` で確認。計画のどこにも "Pages" の言及がなく、M2-8 の `src/` 物理移動＋ESM化で確実にライブデモが破壊される。9 回のレビュー全員がアプリ内部構造に集中し配信インフラを見落としていた盲点 | 1.4-G 新設、1.1 節テーブルに「本番配信」行追加、M2-8 ステップに atomic 対応を追記、M2 完了基準に Pages 生存確認を追加 |
| 抜け漏れ（中） | README.md の「ローカル実行方法」「ファイル構成」が M2-12 まで更新ゲートなし。CLAUDE.md は M1-4 で即時更新されるのに非対称 | M1-4 ステップと M1 完了基準に README.md 同時更新を追記 |
| 抜け漏れ（低） | 「計約 1,700 行」は実測 1,536 行との軽微なズレ | 0.1 節を実測値に修正 |
| セキュリティ | 新規の穴は発見せず（9 パッケージ限定・lockfile・最小権限 CI・innerHTML 箇所も静的テンプレートで安全）。Pages 対応で `pages: write`/`id-token: write` 権限が新規に必要になる点のみ留意 | 1.4-G に権限スコープを明記 |
| 部分最適/全体最適 | Pages の事例以外は、state.ts 非グローバル化・golden-vector 前倒し・allowlist 厳格化など、部分最適の罠を内部的には強く警戒した設計になっていることを確認 | 対応不要（現状の設計を追認） |
| 実装順 | マクロな順序（安全網→最大リスク前倒し→ツール交換→リファクタ、葉→根の ESM 変換順）は手戻り最小化の観点で妥当と確認。ESM の `defer` 実行タイミングという非自明な仕様も検証し本アプリでは実害なしと判断 | 1.4-F に検証済みの注記を追加。Pages 対応は `src/` 移動と同一コミットで atomic に行う制約を明記 |
