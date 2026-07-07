# TypeScript + TDD テスト環境整備 作業記録・進捗管理

**開始:** 2026-07-07 実装開始 / **推定工数:** M1: 5〜7h / M2: 9〜13h / **優先度:** 高
**担当:** AI（Claude Code） / **セッション:** 実装セッション1

参照:
- 計画: `.ai-workspace/20260707-001-ts-tdd-test-infra-plan.md`（同じ NNN=001、ステータス: 最終版）
- 関連: CLAUDE.md / `.ai-workspace/000-ai-progress-management-guide.mdc`

---

## フェーズ進捗

- M1: テスト基盤 [6/6] (100%) - [状態: ✅ 完了]
- M2: リファクタ + TS 完全移行 [2/6] (33%) - [状態: 実装中]

### M1: テスト基盤（自己完結マイルストーン）

| Step | 内容 | 状態 | 完了ゲート |
|---|---|---|---|
| M1-1 | npm scaffold + Playwright + フィクスチャ 2 本（tone/silence）+ ignore 類（コード無変更） | ✅ 完了 | `npx playwright test --list` が通る（8 tests, exit 0）/ ローカル `playwright install chromium` 済み / フィクスチャ（16-bit PCM mono 48kHz、tone-440hz.wav・silence.wav）コミット済み |
| M1-2 | 特性化 E2E（スモーク → 通し〔ラベル pin 含む〕→ ブランチ 2 本、python http.server 対象）+ data: favicon | ✅ 完了 | 録音→decode スモーク単独グリーン（blob size>0 / mimeType `audio/webm;codecs=opus` 確認）/ 5 回観測で ±5Hz 安定（実測 438.7Hz で固定）/ allowlist 実観測で確定（空配列、詳細は下記）/ silence で 0 件到達を確認 / tone・silence 両プロジェクト（計 8 テスト、うち条件外 3 は project 別 skip）5 回連続グリーン |
| M1-3 | CI-smoke 前倒し（ubuntu-latest でスモークのみ、permissions: contents: read、timeout-minutes: 15） | ✅ 完了 | GitHub Actions（run 28873891395）で**初回グリーン**（2 passed, 6.0s）。Linux 実行確認・±5Hz 許容の最終確定済み |
| M1-4 | Vite 導入（classic 無変換配信を冒頭確認、tsconfig 2 分割、webServer 切替） | ✅ 完了 | E2E グリーン（spec 無修正・webServer コマンドのみ変更）/ 観測値・allowlist を Vite dev 配信下で 3 回再確認・変化なし / CLAUDE.md 起動コマンド更新 / README.md ローカル実行方法・claude.md 誤記も修正 |
| M1-5 | Vitest + ESLint（flat・scope 分離）+ Prettier（一括整形は単独コミット） | ✅ 完了 | サンプルテスト（`src/sample.test.ts`）1 件グリーン / `lint`（レガシー JS 含め 0 warning）/ `format:check` / `typecheck` 全て通過。全ファイル一括整形（`npm run format`）実施後 E2E 再グリーン確認済み（挙動保存を実証） |
| M1-6 | CI-full（最小 + retries + trace/screenshot + artifact upload） | ✅ 完了 | GitHub Actions（run 28873891839）で**初回グリーン**（typecheck/lint/format:check/test 全通過、E2E 5 passed・3 skipped, 22.1s）。**← M1 完了・価値確定点** |

### M2: リファクタ + TypeScript 完全移行

| Step | 内容 | 状態 | 完了ゲート |
|---|---|---|---|
| M2-7 | dsp.ts 抽出 + golden-vector 固定（born-ESM 独立モジュール、アプリ未接続） | ✅ 完了 | golden（frequency/rawAmplitude/phase/amplitudeDB/maxAmplitude、rel 1e-6）+ 解析的期待値 + 8kHz 境界、計 11 テストグリーン。coverage 98.73% stmts / 87.5% branches（report-only） |
| M2-8 | state 設計 + ESM 化（window ブリッジ、葉→根、src/ 移設、dsp.ts 差し替え、audioContext は移行期 state 方式）+ GitHub Pages デプロイ移行（1.4-G、src/ 移設と atomic） | ✅ 完了 | 4 ファイル ESM 化・E2E 5 回連続グリーン・`vite build` 成功・GitHub Actions 3 ワークフロー（CI/CI Smoke/Deploy to GitHub Pages）全て初回グリーン・**ライブ URL（masnak.github.io/waveVisualizer）で初期化→録音→解析→合成再生の通しを実機確認済み（スクリーンショット証跡あり）**。**計画からの変更点**: CI E2E の build+preview 対象切替は `vite preview` の既知の不具合により断念（詳細下記） |
| M2-9 | init() 集約（両ファイル、readyState ガード、ポーリング timeout=resolve） | ⬜ 未着手 | E2E グリーン / resume 経路の手動確認 1 回 |
| M2-10 | synthesis.ts / signal.ts / collectSelectedComponents（includeTestWaves パラメータ化）抽出 | ⬜ 未着手 | ユニット + E2E グリーン |
| M2-11 | 全 .ts 化 + allowJs off + rAF start/stop（設計改善と分類）+ Map 化 + AppContext 収斂 | ⬜ 未着手 | `tsc --noEmit`（strict, allowJs off）ゼロ / ブリッジ・state.audioContext 全廃 / ユニット + E2E グリーン |
| M2-12 | 最終ドキュメント同期 + coverage 参考値・既存バグ / E2E 盲点一覧の記録 | ⬜ 未着手 | CLAUDE.md/README のコマンドが実際に動く |

---

## 現在実行中

**M1 完了。M2-7・M2-8 完了**（GitHub Pages は GitHub Actions デプロイへ移行済み、ライブ URL 動作確認済み）。次は M2-9（init() 集約）着手待ち。

---

## 完了記録

### M1-1: npm scaffold + Playwright 導入（2026-07-07）

- `package.json`（`type: module`、`test:e2e` script）/ `.nvmrc`（24）作成
- `@playwright/test` を devDependency として導入（`npm install --save-dev`）、`npx playwright install chromium` でローカルにバイナリ導入済み
- `.gitignore` に `node_modules/` `dist/` `playwright-report/` `test-results/` `coverage/` `*.tsbuildinfo` を追記
- `.prettierignore` 新規作成（`dist/` `coverage/` `playwright-report/` `test-results/` `e2e/fixtures/*.wav`）
- `e2e/fixtures/generate-tone.mjs` を作成し `tone-440hz.wav`（440Hz・振幅 0.5・3 秒・20ms フェード）と `silence.wav`（同尺の無音）を生成・コミット対象化。仕様通り 16-bit PCM mono 48000Hz を確認（`file` コマンドで検証）
- `playwright.config.ts` 作成（2 プロジェクト `tone`/`silence`、`webServer: python3 -m http.server 8000`、`retries: CI?2:0`、`trace: on-first-retry`、`screenshot: only-on-failure`）
- 検証: `npx playwright test --list` → 8 tests, exit 0

### M1-2: 特性化 E2E 作成（2026-07-07）

- `index.html` に `<link rel="icon" href="data:,">` を追加（0.5 節の例外③、唯一の許容コード変更）
- 探索用スクリプト（`e2e/_explore.spec.ts`、非コミット・作業後削除）で実挙動を観測してから本実装:
  - **重要な発見**: `initializeAudioAndVisualizer()` 内の `audioContext.state === 'running'` ポーリングが、headless Chromium ではフラグなしだと無限にハングする（`init-btn` が disabled にならない）。`--autoplay-policy=no-user-gesture-required` を `launchOptions.args` に追加して解消。1.4-C で「保険として仮置き」とされていたが、**実際には必須**と判明したため正式採用（`playwright.config.ts` の `fakeAudioArgs()` に追加）
  - tone プロジェクトで 5 回連続観測: 最上位成分は毎回 **438.7Hz（音量 1.000）**で安定（440Hz 目標に対し ±5Hz 許容内）。2 位は 441.4Hz・音量 0.949〜0.954、3 位は 436.0Hz・音量 0.153〜0.193（位相は毎回大きく変動 → 計画通り pin 対象から除外）
  - silence プロジェクトで 5 回連続観測: 毎回 **0 成分**（`analyseRecording()` が閾値を超える成分を検出せず）→ test-wave フォールバック（`test-wave-0/1/2`）が表示されることを確認。1.4-C の懸念（Opus 経由ノイズで 0 にならない可能性）は本フィクスチャでは発生せず
  - **console.error allowlist は実観測の結果、空配列で確定**。計画 1.4-B が候補に挙げていた spectrumVisualizer の「🚨 20kHz超」診断は、tone/silence 双方・happy path/両ブランチを通しても一度も発火しなかった（tone 5 回 + silence 5 回、全 10 回で console.error 件数 0）。推測でパターンを allowlist に追加することはせず、`CONSOLE_ERROR_ALLOWLIST = []` とした。将来 Linux CI 等で実際に該当パターンが観測された場合はその時点で追加する
  - console.warn は録音中の高振幅監視ログにより 1 回の通しシナリオで数千件発生することを確認（アサーション対象外のため無視）
  - ステータスメッセージの実文言を採取し、待機条件・アサーションに使用（例: 再生完了「再生が完了しました」、比較完了「原音の再生が完了しました。...」）
- `e2e/workflow.spec.ts` 本実装（4 テスト定義 × 2 プロジェクト = 8、うち project 不一致で 3 件 skip）:
  1. スモーク: 初期化→録音→`recordedChunks[0].size>0`・`mimeType` が `audio/` prefix・pageerror/console.error ゼロ
  2. happy path（tone 限定）: 初期化→録音→再生→解析→上位 1〜3 成分ラベルの周波数(±5Hz)+相対音量を pin→全て選択→合成再生→原音比較→波形停止
  3. 分岐 1（tone 限定）: 個別チェックボックス選択→全て解除→波形停止
  4. 分岐 2（silence 限定）: 解析 0 件→test-wave フォールバック 3 件確認→個別チェック→全解除→波形停止
  - 待機は全て状態ベース（`toBeEnabled`/`toBeVisible`/`toHaveText`/`toBeChecked` の自動リトライ）。固定 `waitForTimeout` は不使用
- 検証: `npx playwright test --list` exit 0（8 tests）/ 全テストを **5 回連続実行**しオールグリーン（tone happy path は毎回約 9〜11s、silence 分岐は約 4〜5s）

### M1-3: CI-smoke ワークフロー作成 + Linux 実行確認（2026-07-07）

- `.github/workflows/ci-smoke.yml` 作成: ubuntu-latest / permissions: contents: read / actions/checkout@v4 / actions/setup-node@v4（.nvmrc 参照 + cache: npm）/ npm ci / npx playwright install --with-deps chromium / timeout-minutes: 15 / スモークテストのみ --grep で絞り込み実行
- YAML 構文を python3 の yaml モジュールでローカル検証（GitHub Actions 実行環境がないため構文チェックのみ）
- **push 後の実行結果（2026-07-07）**: GitHub Actions run [28873891395](https://github.com/masnak/waveVisualizer/actions/runs/28873891395) で**初回グリーン**（2 passed, 6.0s）。Linux（ubuntu-latest）でも `--autoplay-policy=no-user-gesture-required` フラグで headless 録音経路が問題なく動作することを確認。**±5Hz 許容の最終確定完了**（macOS ローカル観測値と Linux CI で乖離なし、許容幅の再ピンは不要）

### M1-4: Vite 導入（2026-07-07）

- vite / typescript を devDependency に追加。tsconfig.json（src 用、strict+allowJs）/ tsconfig.node.json（vite.config/playwright.config/e2e 用）を作成
  - 計画からの逸脱（要記録）: tsconfig.node.json の型検査（node:url の fileURLToPath、process.env.CI）には @types/node が必須だが、計画 1.1 節の devDependencies 一覧（9 個）に含まれていなかった。9 回のレビューでも指摘されなかった抜け。@types/node を 10 個目の devDependency として追加した（これがないと tsc --noEmit が config/e2e ファイルに対して意味をなさない）
- vite.config.ts 作成（server.port: 8000）。1.4-F の検証: npx vite で classic script（main.js 等）が変換されず raw 配信されることを curl で確認（HMR client script が注入される以外は無変換）→ fallback（public/ 配下移動）は不要と確定
- package.json に dev/build/preview/typecheck script 追加
- playwright.config.ts の webServer.command を python3 -m http.server 8000 → npm run dev に変更（spec 側は無修正）
- 検証: E2E を Vite dev 対象で 3 回実行し全グリーン。±5Hz・allowlist の観測値に変化なし
- ドキュメント更新: CLAUDE.md の「起動」節・「ブラウザ自動検証」節（npm run dev / npm run test:e2e / autoplay フラグ必須の注記）、README.md の「ローカル実行方法」節（npm run dev へ）、および claude.md（誤記）→ CLAUDE.md の参照修正

### M1-5: Vitest + ESLint + Prettier 導入（2026-07-07）

- devDependency 追加: vitest / @vitest/coverage-v8 / eslint / typescript-eslint / prettier / eslint-config-prettier
- vitest.config.ts: environment: 'node'（jsdom 不使用）、include: ['src/**/*.test.ts']、coverage は src/audio/** 対象 report-only
- src/sample.test.ts: Vitest 導入確認用の scaffold テスト（window === undefined を確認して node 環境であることを担保）。M2-7 で dsp.ts の実テストが揃い次第削除予定
- eslint.config.js（flat config、scope 分離）:
  - レガシー 4 ファイル（main.js/waveVisualizer.js/spectrumVisualizer.js/sinewaveAnalyser.js）のみを明示的な files 配列で指定し sourceType: 'script' + 最小ルール（no-redeclare/no-dupe-keys/no-unreachable）を適用。no-undef は付与しない（未定義グローバル検出は tsc に委ねる方針、1.4 節）
  - **/*.ts に typescript-eslint の recommended を適用
  - eslint-config-prettier で整形系ルールとの競合を無効化
  - 注意: @eslint/js（eslint:recommended 提供パッケージ）は計画の 9 パッケージリストに含まれないため意図的に不使用。legacy scope は「最小ルール」の趣旨通り最小限の手動選定とした
- .prettierrc.json 作成（printWidth 100 / singleQuote / semi / trailingComma all）
- .prettierignore に *.md を追加（.ai-workspace 進捗記録・CLAUDE.md・README.md 等のプロースは Prettier の markdown 整形による意図しない差分を避けるため対象外化。計画には明記がなかったための実装判断）
- package.json に test/test:watch/test:coverage/lint/format/format:check script 追加
- 全ファイル一括整形実施（npm run format）: index.html + レガシー 4 .js ファイル + 新規作成の e2e/workflow.spec.ts/eslint.config.js を整形（tab→2-space、シングルクォート統一等、フォーマットのみ・ロジック無変更）。整形直後に E2E を再実行し全グリーンを確認済み（挙動保存を実証）
- 検証: npm test（sample 1 件グリーン）/ npm run lint（0 warning）/ npm run format:check（全ファイル準拠）/ npm run typecheck（エラーゼロ）/ npm run test:coverage（0% 表示、report-only として想定通り。src/audio 未作成のため対象ファイルなし）

### M1-6: CI-full ワークフロー作成 + Linux 実行確認（2026-07-07）

- .github/workflows/ci.yml 作成: push(main)/pull_request トリガ、permissions: contents: read、単一ジョブで typecheck→lint→format:check→test→test:e2e を順次実行。失敗時 playwright-report/・test-results/ を actions/upload-artifact@v4 でアップロード
- retries（CI ? 2 : 0）・trace/screenshot 設定は M1-1 で playwright.config.ts に組み込み済みのため追加変更不要
- 計画通り「入れないもの」を未導入のまま維持: Playwright ブラウザバイナリキャッシュ / concurrency キャンセル / coverage ゲート
- ローカルで CI と同一の手順を通しで実行（typecheck && lint && format:check && test && test:e2e）し全グリーンを確認
- **push 後の実行結果（2026-07-07）**: GitHub Actions run [28873891839](https://github.com/masnak/waveVisualizer/actions/runs/28873891839) で**初回グリーン**（typecheck/lint/format:check/test 全通過、test:e2e は 5 passed・3 skipped, 22.1s）。**M1 完了・価値確定点に到達**

### M2-7: dsp.ts 抽出 + golden-vector 固定（2026-07-07）

- `src/types.ts` 作成: `FrequencyComponent` / `AnalysisResult` 共有型（計画 1.2、早期定義）
- `src/audio/dsp.ts` 作成: `sinewaveAnalyser.js` の `analyseRecording()` から DFT・ハミング窓・動的閾値・8kHz フィルタ・dB 変換ロジックを `analyseFrequencyComponents(channelData, sampleRate, fftSize=16384)` としてそのまま複製。唯一の変換は `maxAnalysisAmplitude` のグローバル書込 → `AnalysisResult.maxAmplitude` の戻り値化（計画通り）。console.log/warn は挙動維持のためそのまま残置。この時点でアプリからは未参照（`main.js` 等は無変更）
- `src/audio/dsp.test.ts` 作成、探索スクリプト（`src/audio/_explore.test.ts`、非コミット・作業後削除）で実際の出力を観測してから golden 値を確定:
  - **golden-vector**: sampleRate=8000/fftSize=512 で bin 8/16/32（125/250/500Hz）に位相付き 3 成分を合成 → ハミング窓のサイドローブ漏れにより実際には **9 成分**が動的閾値を超えて検出されることを観測（105.375Hz 等の漏れ成分含む）。これも含めて `frequency`/`rawAmplitude`/`phase`/`amplitude`(dB)/`maxAmplitude` を rel 1e-6 でロック。決定性テスト（同一入力を 2 回実行し `toEqual`）も追加
  - **解析的期待値**: bin 中心・振幅 A=1.0 の単一正弦波で `rawAmplitude ≈ 0.5`（A/2、観測誤差 rel ~1e-5、rel 1e-3 で assert）。位相は実装のDFT角度規約（`angle = -2πkn/N`）を手動導出し `phase ≈ atan2(-cos(φ), sin(φ))` と一致することを確認（φ=0 のとき `-π/2`、計画記載の期待値と一致）。5 種類の位相（0, π/6, π/2, π, -π/3）で `it.each` により検証
  - **8kHz 境界値**: sampleRate=44100/fftSize=1024。**設計の失敗から学んだ点**: 最初 below=bin185(~7967Hz)/above=bin186(~8010Hz) の 2 成分だけを合成したところ隣接 bin 同士でスペクトル漏れが激しく干渉し閾値判定が意図通りにならなかった。anchor 成分を境界から遠い低周波（bin23, ~990.5Hz）に移し、below/above はそれぞれ**単独**で anchor と合成することで漏れを分離。`targetAmp=0.003` で below は採用・above は棄却（10 倍厳格化の効果を確認）、`targetAmp=0.03` で above も採用されることを確認
- 検証: `npm test` 11 tests 全グリーン / `npm run typecheck`・`npm run lint`・`npm run format:check` エラーゼロ / `npm run test:coverage` で `src/audio/dsp.ts` 98.73% stmts・87.5% branches・100% funcs（report-only、参考値として記録）
- **`src/sample.test.ts`（M1-5 の scaffold）を削除**。実テストに置き換え完了

### M2-8: state 設計 + ESM 化 + GitHub Pages デプロイ移行（2026-07-07/08・ローカル完了、push 待ち）

**技術的前提の事前検証（実装前）**:

- ESM 移行の中核前提（「変換済み module が未変換の classic script のトップレベル `let`/関数宣言をベア識別子として読めるか」）は計画のどこにも実証されていなかったため、本番デモを壊すリスクを避けるべく最小の再現ケース（classic script の `let`/`function` を module 側から bare 参照）を作って実際のブラウザ（Playwright）で検証。**結果: 読める**ことを確認（`bareLet: 42`, `bareFunction: "from classic function"` を観測、`window.classicTopLevelLet` は `undefined` で let/const が window に付かないことも確認）。これにより sinewaveAnalyser.ts が未変換の main.js から `audioContext`/`recordedChunks`/`showStatusMessage` を安全に bare 参照できる設計が成立することを事前に実証

**state.ts 設計（1.4-A）**:

- 当初想定より対象を絞り込み: `audioContext` と `recordedChunks` の**2 項目のみ**を `state.ts` に集約。`micSoundAnalyser`/`waveVisualizer`/`spectrumVisualizer`（インスタンス）/`mediaRecorder`/`audioStream` は main.js 内でしか読まれないため state.ts に含めず、そのファイルのローカル変数のまま残した（「グローバル変数の引っ越しにしない」という 1.4-A の原則を実地で確認）
- 移行中（main.js が classic のままの間）は `window.appState`（state オブジェクトの window ブリッジ）経由で main.js 側から `window.appState.audioContext = audioContext` のようにミラー書込みする最小限の追加を実施。main.ts 変換完了時にブリッジを除去し、通常の import に一本化

**showStatusMessage の扱い（計画になかった判断）**:

- 計画の目標ディレクトリ構成には `ui/status.ts` があったが、いつ切り出すかは明記されていなかった。sinewaveAnalyser.ts 変換時点で born-ESM の独立モジュールとして早期に切り出し（dsp.ts と同じ思想）、main.js（classic）は自身の重複定義をそのまま維持 → main.ts 変換時に import へ統合、という形で bare-global 依存を完全に回避した

**変換順序と実施内容（計画通り 葉→根）**:

1. `waveVisualizer.js` → `src/visualizers/waveVisualizer.ts`（クラスをそのまま複製、window ブリッジ）
2. `spectrumVisualizer.js` → `src/visualizers/spectrumVisualizer.ts`（同上。`window.analyserSettings` の型宣言は残置）
3. `sinewaveAnalyser.js` → `src/sinewaveAnalyser.ts`（最大のファイル、1040 行）。`state.ts`/`ui/status.ts`/`dsp.ts` を import。`analyseRecording()` 内の DFT 計算をまるごと `analyseFrequencyComponents()` 呼び出しへ差し替え（golden-vector が保護）。**main.js に 2 行のミラー書込み追加**（`audioContext`/`recordedChunks` の再代入箇所）
4. `main.js` → `src/main.ts`（最後）。`state.ts`/`ui/status.ts`/visualizer クラスを正式 import へ切替、`sinewaveAnalyser.js` を副作用目的で bare import。全 window ブリッジ（`WaveVisualizer`/`SpectrumVisualizer`/`appState`）を除去。`index.html` を単一 `<script type="module" src="/src/main.ts">` エントリに統合

各ステップで `typecheck`/`lint`/`format:check` エラーゼロ + E2E グリーンを確認（3 と 4 は特に慎重に複数回実行）。

**発見した既存バグ（記録のみ、TS strict 化で顕在化）**:

- `selectedCount`（全選択ハンドラ内のローカル変数）は元 main.js でも代入されるだけで一切参照されない dead code だった。TS の `no-unused-vars` で初めて検出。観測不能な変更（削除しても出力に一切影響しない）のため削除
- `typeof showStatusMessage === 'function'` の防御チェックは import ベースの静的解決に置き換わったことで意味を持たなくなったため、書き換え時に自然に単純呼び出しへ簡略化（挙動に影響なし。呼び出し時点では常に関数が存在することが保証されるため）

**E2E テストの修正（アプリの内部実装非依存化）**:

- main.ts の ESM 化により `page.evaluate(() => recordedChunks)` のような bare global 参照が不可能になった（意図した設計変化）。スモークテストを、アプリ内部のモジュール境界に依存しない形へ書き換え: `page.addInitScript()` でブラウザ標準の `MediaRecorder` コンストラクタ自体を計装し、実際に生成された `Blob`/`mimeType` を直接観測する方式に変更。これにより今後のさらなるリファクタ（M2-9〜M2-11）でモジュール構造が変わってもこのテストは影響を受けない

**vite build + GitHub Pages 対応**:

- `vite.config.ts` に `base: command === 'build' ? '/waveVisualizer/' : '/'` を条件分岐で追加（dev server の E2E baseURL に影響を与えないため）
- `npm run build` 成功を確認（11 modules → `dist/index.html` + `dist/assets/index-*.js`、29.42kB）。`dist/index.html` のアセット参照が `/waveVisualizer/assets/...` に正しく書き換わることを確認
- `.github/workflows/deploy-pages.yml` 作成（`vite build` → `actions/upload-pages-artifact` → `actions/deploy-pages`、`permissions: {contents: read, pages: write, id-token: write}`、`concurrency: {group: pages, cancel-in-progress: false}`）

**計画からの重要な逸脱: `vite preview` の不具合により CI E2E の build+preview 切替を断念**:

- 計画は「M2-8 完了後、CI の E2E を build+preview 対象に切替」としていたが、`vite preview` + `base` サブパス設定の組み合わせで、実ブラウザからの ES module スクリプト読み込み（`<script type="module">`、常に `Origin` ヘッダー付き CORS モードでフェッチされる仕様）だけが 404 になる、または SPA フォールバックにより誤って `index.html` の内容が返る不具合を発見。`curl`（ヘッダーなし）や `page.evaluate()` 内の `fetch()` では再現しないため長時間切り分けに苦労したが、最終的に **Vite 本体の既知の不具合カテゴリ**（`connect-history-api-fallback` の Accept ヘッダー判定が実ブラウザのリクエストと食い違う。[vitejs/vite#15022](https://github.com/vitejs/vite/issues/15022) 等）であり、`crossorigin` 属性の有無に関わらず発生することを実験で確認
  - GitHub Pages は純粋な静的ファイル CDN で `vite preview` のようなミドルウェアを一切持たないため、**この不具合は実デプロイには影響しない**と判断
  - ユーザーと協議の上、**vite preview を用いたローカル/CI 自動 E2E は断念**。代わりに ①`vite build` のローカル成功確認、②`curl` による dist/ 静的配信の直接検証（実施済み）、③実際に GitHub Pages へデプロイした後のライブ URL に対する手動確認、の 3 点で計画の意図（bundled build でも動作すること）を担保する方針に変更
  - `playwright.config.ts` / `.github/workflows/ci.yml` の `test:e2e` は **dev server 対象のまま維持**（変更なし）。計画の「CI = build+preview（M2-8 で切替）」は本件により不採用とし、この逸脱を正式に記録する

**push・GitHub Pages Source 切替・デプロイ確認（2026-07-08、ユーザー承認済み）**:

- ユーザーに詳細（vite preview 不具合の切り分け経緯・実施手順）を提示し、明示的な承認を得た上で実施
- 実行順序（ダウンタイム最小化のため）: ① コミット作成（ローカルのみ）→ ② `gh api -X PUT repos/masnak/waveVisualizer/pages -f build_type=workflow` で Pages Source をレガシー branch 配信から GitHub Actions へ切替 → ③ `git push` → ④ 3 ワークフロー（CI/CI Smoke/Deploy to GitHub Pages）の実行確認
- **結果**: 3 ワークフロー全て初回グリーン（Deploy to GitHub Pages: build 10s + deploy 8s / CI: 5 passed・3 skipped, 22.9s / CI Smoke: 2 passed, 5.2s）
- `curl` でライブ URL・アセットともに 200 応答を確認後、**実際のライブ URL（`https://masnak.github.io/waveVisualizer/`）に対して Playwright（フェイクマイク）で初期化→録音→周波解析→全て選択→合成再生→比較ボタン活性化までの通しシナリオを実行し成功。フルページスクリーンショットで波形・スペクトラム・合成波形・成分リストが正しく表示されていることを目視確認済み**（M2 完了基準の「Pages 切替後にライブ URL が 200 で応答し主要ワークフローが手動で通ることを確認」を実質的に充足。「手動」の定義は本プロジェクトの CLAUDE.md が定めるフェイクデバイス Playwright 方式に準拠）
- リポジトリの Pages 設定を `gh api repos/masnak/waveVisualizer/pages` で最終確認: `"build_type":"workflow"`（切替完了）

---

## 検証チェックリスト（計画書 Done 基準の転記）

### M1 完了基準

- [x] 特性化 E2E（スモーク + 通し + ブランチ 2 本、tone / silence 両プロジェクト）が現行挙動のままグリーン
- [x] 未捕捉例外ゼロ・console.error（厳密 allowlist 除外後）ゼロ
- [x] 上位成分の周波数（±5Hz、初回 CI で最終確定）+ 相対音量が pin 済み（Linux CI run 28873891839 で最終確定）
- [x] `npm run dev` で起動し、主要ワークフロー（初期化 → 録音 → 周波解析 → 成分選択 → 合成再生 → 原音比較）が手動でも通る（headed Playwright + fake-device flags でスクリーンショット付き確認済み。実マイクが使えない自動化環境のため、CLAUDE.md 既定のフェイクデバイス方式を「手動確認」の代替手段として採用）
- [x] `lint` / `format:check` / `typecheck` / `test`（サンプル）が通る
- [x] GitHub Actions（CI-smoke → CI-full）が push / PR で全チェックグリーン（run 28873891395 / 28873891839、共に初回グリーン）
- [x] CLAUDE.md の起動コマンドが実態と一致。README.md のローカル実行方法も `npm run dev` に更新済み（M1-4）

### M2 完了基準

- [ ] dsp / synthesis / signal のユニットテストがグリーン（golden 5 フィールド + 解析的期待値 + 8kHz 境界）
- [ ] `collectSelectedComponents`（includeTestWaves 付き）の node ユニットテストがグリーン
- [ ] `tsc --noEmit`（strict、allowJs off）・`lint --max-warnings=0`・`format:check` エラーゼロ
- [ ] `vite build` 成功 + CI の E2E が build + preview 対象でグリーン
- [ ] window ブリッジ全除去・`state.audioContext` 廃止・AppContext 注入に収斂
- [ ] GitHub Pages ライブデモが GitHub Actions ベースのデプロイへ移行済み・URL が 200 で応答し主要ワークフローが手動で通る（1.4-G、M2-8 と atomic）
- [ ] テスト実行時間: ユニット < 5s / E2E < 90s 目安
- [ ] CLAUDE.md / README が新フロー・構成と一致
- [ ] 既存バグ・E2E 盲点・意図的挙動変更（計画 0.5 例外①〜③）が本ファイルに記録済み

---

## 品質保証チェックリスト

### コード品質（M1 時点）

- [x] コンソールエラーなし（計画 1.4-B の定義: pageerror ゼロ + 厳密 allowlist 除外後 console.error ゼロ）
- [x] Prettier / ESLint 通過（M1-5 以降）
- [x] 整形コミットとロジック変更コミットが分離されている（`3a88c32` が整形専用コミット）

### 動作品質（M1 時点）

- [x] 主要ワークフローがブラウザで通る（各ステップの完了ゲート。headed Playwright + スクリーンショットで確認）
- [x] 挙動保存: 既存バグは修正せず記録のみ（許容される挙動変更は計画 0.5 の例外①③のみ実施。②の rAF start/stop 化は M2-11 で実施予定）

### 記録品質（M1 時点）

- [x] 主要成果物・発生した問題と解決策を記録
- [x] 証跡リンク（commit/PR）を記録（コミットハッシュ・GitHub Actions run URL を本ファイルに記載済み）
- [x] 次作業への影響・注意事項を記録（M2-7 着手時の scaffold テスト削除、既知バグ一覧等）

---

## 問題・エラー記録 🚨

（発生時に即記録。テンプレ: 問題ID / 種別 / 影響度 / 状態 / 現象 / 原因 / 解決策 / 検証 / 予防策）

### 既存バグ・盲点の記録（修正せず別計画へ回すもの）

計画時点で判明しているもの（実装中の観測で追記・確定する）:

- [既知-1] rAF 自己ループの多重化（初期化ボタン連打で発火しうる）→ M2-11 で設計改善として解消予定
- [既知-2] `calculateSynthesisWaveform` の sampleRate=44100 ハードコード vs 音声パスの実 sampleRate 不一致 → 引数化・デフォルト維持で温存
- [既知-3] main.js の未使用 `const sampleRate = 44100`（デッドコード）→ 記録のみ
- [盲点-1] suspended → resume 分岐は E2E で実行されない（autoplay 緩和下）→ M2-9 で手動確認
- [盲点-2] test-wave 3 経路は silence フィクスチャで 0 件にできない場合 E2E 検証不能 → M1-2 で確定。**結果: silence フィクスチャで 5 回連続 0 件を観測、E2E 検証可能と判明（盲点は解消）**

---

## 技術的発見・学習記録 💡

（発見時に追記。テンプレ: 発見ID / 内容 / 適用箇所 / 注意点）

- [発見-1] headless Chromium では `--autoplay-policy=no-user-gesture-required` フラグが**必須**（仮置きではなく確定採用）。フラグなしだと `new AudioContext()` が `suspended` のまま `running` に遷移せず、`initializeAudioAndVisualizer()` 内のポーリング Promise が永久に解決しない → `init-btn` が無効化されない → 以降の全フローがブロックされる。M1-2 の冒頭スモークで最初に踏んで発見。適用箇所: `playwright.config.ts` の `fakeAudioArgs()`。CI（Linux）でも同条件で必要になる可能性が高いため M1-3 で再確認する
- [発見-2] console.error の allowlist は実観測ベースで**空配列**が正しい（1.4-B の想定候補「🚨 20kHz超」は今回のフィクスチャ・シナリオでは非発火）。tone/silence × happy path/両分岐、計 10 回の観測で console.error 総数 0 件。将来 CI やフィクスチャ変更で実際に該当パターンが出た場合のみ、その時点の実観測に基づき追加する（推測追加はしない）
- [発見-3] `recordedChunks` / `mediaRecorder` は classic script の top-level `let` 宣言だが、`page.evaluate()` から素の識別子として直接参照可能（script scope は CDP 経由の評価コンテキストからアクセスできるため、`window.` prefix 不要）
- [発見-4] 計画 1.1 節の devDependencies「9 個」リストに `@types/node` が含まれていなかった（9 回のレビューでも未指摘）。`tsconfig.node.json` で `playwright.config.ts`/`e2e/*.spec.ts` を型検査する以上、`node:url` や `process.env` の型解決に必須。M1-4 で 10 個目の devDependency として追加。実装時に判明した計画の軽微な抜け（GitHub Pages 抜け漏れと同種の「ツール構成の盲点」）

---

## 仕様決定（計画書 1.3 / 1.4 の要約。詳細は計画書参照）

- スコープ: リファクタまで含む / Vite / CI 薄く（2 段: smoke 前倒し + full）/ ログ挙動維持
- 2 マイルストーン管理（M1 で価値自己完結）
- スリム化: coverage report-only / jsdom 不使用 / noUncheckedIndexedAccess off / 境界値は 8kHz のみ
- ローカル E2E = dev server / CI = build + preview（M2-8 で切替）
- ESM 移行は window ブリッジ方式 / golden-vector は M2 冒頭に前倒し / 選択収集は includeTestWaves パラメータ化
- GitHub Pages（レガシー配信 `source: main:/`）は M2-8 で GitHub Actions ベースのデプロイへ移行（`base: '/waveVisualizer/'`、`src/` 移設と atomic。1.4-G、Phase 7 実装前レビューで追加）

---

## コミット履歴（M1）

1. `aa38fae` Add TypeScript/TDD test infrastructure scaffold（M1-1, M1-3〜M1-6 設定ファイル）
2. `4f5cb34` Add characterization E2E tests + favicon（M1-2）
3. `3a88c32` Reformat with Prettier（M1-5、整形専用）
4. `8865401` Update CLAUDE.md/README.md for Vite dev server（M1-4）
5. `6a0df95` Add TS+TDD test infra plan, review, and progress log
6. push 後: GitHub Actions run [28873891395](https://github.com/masnak/waveVisualizer/actions/runs/28873891395)（CI Smoke, success）/ [28873891839](https://github.com/masnak/waveVisualizer/actions/runs/28873891839)（CI, success）

## 次のアクション

**M1 完了**（全チェックリスト・GitHub Actions 実行確認込み）。次は M2-7（dsp.ts 抽出 + golden-vector 固定）から着手。M2-8（ESM 化 + `src/` 物理移動 + GitHub Pages デプロイ移行）は現行のレガシー Pages 配信（`source: main:/`）を破壊しうる atomic 作業のため、着手前に改めてユーザー確認を挟む想定（計画 1.4-G 参照）。

## 最終更新

**最終更新:** 2026-07-07（**M1 全ステップ完了**。GitHub Actions CI-smoke/CI-full 共に push 後初回グリーン。次は M2-7 着手待ち）
