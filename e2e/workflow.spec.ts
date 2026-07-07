// 特性化 E2E: 現行 JS アプリの実挙動を固定する安全網。
// 「あるべき挙動」ではなく実観測結果を pin する（計画 0.4/1.4-D 参照）。
import { test, expect, type Page, type ConsoleMessage } from '@playwright/test';

// page.evaluate() はブラウザコンテキストで実行され、レガシー classic script
// (main.js) の top-level `let` グローバルを直接参照する。M2-8 の ESM 化までの
// 暫定的な型宣言（本ファイルの評価コンテキスト限定）。
declare const recordedChunks: Blob[];
declare const mediaRecorder: MediaRecorder | undefined;

// 実観測（tone/silence 各5回 × 通しシナリオ+分岐）の結果、console.error は
// 0件だった。計画 1.4-B が候補に挙げた spectrumVisualizer の「🚨 20kHz超」診断は
// 今回のフィクスチャでは一度も発火しなかったため、推測で allowlist に加えず空とする。
const CONSOLE_ERROR_ALLOWLIST: RegExp[] = [];

function trackConsoleAndPageErrors(page: Page) {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (msg: ConsoleMessage) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => pageErrors.push(String(err)));
  return {
    assertClean() {
      const unexpected = consoleErrors.filter(
        (text) => !CONSOLE_ERROR_ALLOWLIST.some((pattern) => pattern.test(text)),
      );
      expect(unexpected, 'unexpected console.error output').toEqual([]);
      expect(pageErrors, 'uncaught page errors').toEqual([]);
    },
  };
}

async function initAndRecord(page: Page) {
  await page.goto('/');
  await page.click('#init-btn');
  await expect(page.locator('#init-btn')).toBeDisabled({ timeout: 5000 });

  await page.click('#record-btn');
  // 録音完了 = 音声再生/周波解析ボタンの活性化（固定 sleep は使わない）
  await expect(page.locator('#play-btn')).toBeEnabled({ timeout: 5000 });
  await expect(page.locator('#analyse-btn')).toBeEnabled({ timeout: 5000 });
}

test.describe('smoke: headless recording pipeline', () => {
  test('captures non-empty audio via MediaRecorder', async ({ page }) => {
    const tracker = trackConsoleAndPageErrors(page);
    await initAndRecord(page);

    const recording = await page.evaluate(() => ({
      size: recordedChunks[0]?.size ?? 0,
      count: recordedChunks.length,
      mimeType: mediaRecorder?.mimeType ?? '',
    }));

    expect(recording.count).toBe(1);
    expect(recording.size).toBeGreaterThan(0);
    expect(recording.mimeType).toMatch(/^audio\//);

    tracker.assertClean();
  });
});

test.describe('happy path: select all -> synthesize -> compare -> stop', () => {
  test('runs the full workflow and pins top components', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'tone', 'requires tone-440hz fixture');
    const tracker = trackConsoleAndPageErrors(page);
    await initAndRecord(page);

    await page.click('#play-btn');
    // 再生完了 = ステータスメッセージ
    await expect(page.locator('#status-message')).toHaveText('再生が完了しました', {
      timeout: 6000,
    });

    await page.click('#analyse-btn');
    // 解析完了 = 成分リスト DOM の出現（同期 O(N^2) DFT のため長めのタイムアウト）
    await expect(page.locator('#sine-waves-list li').first()).toBeVisible({ timeout: 15000 });

    const labels = await page.locator('#sine-waves-list label').allTextContents();
    const componentLabels = labels.filter((text) => /^★?\d+\./.test(text));
    expect(componentLabels.length).toBeGreaterThan(0);

    // 数値 pin: 上位3成分の周波数(±5Hz、初回CIで最終確定予定) + 相対音量。位相は
    // スペクトル漏れで揺れやすいため pin しない（計画 1.4-D）。
    const parseLabel = (label: string) => {
      const match = label.match(/([\d.]+)\s*Hz\s*-\s*音量:\s*([\d.]+)/);
      if (!match) throw new Error(`unexpected label format: ${label}`);
      return { frequencyHz: Number(match[1]), relativeVolume: Number(match[2]) };
    };

    const top1 = parseLabel(componentLabels[0]);
    expect(top1.frequencyHz).toBeGreaterThan(440 - 5);
    expect(top1.frequencyHz).toBeLessThan(440 + 5);
    expect(top1.relativeVolume).toBe(1);

    if (componentLabels.length > 1) {
      const top2 = parseLabel(componentLabels[1]);
      expect(top2.frequencyHz).toBeGreaterThan(440 - 5);
      expect(top2.frequencyHz).toBeLessThan(440 + 5);
      expect(top2.relativeVolume).toBeGreaterThan(0.8);
    }

    if (componentLabels.length > 2) {
      const top3 = parseLabel(componentLabels[2]);
      expect(top3.frequencyHz).toBeGreaterThan(440 - 5);
      expect(top3.frequencyHz).toBeLessThan(440 + 5);
    }

    await page.click('#auto-select-btn');
    await expect(page.locator('#sine-wave-0')).toBeChecked();

    await page.click('#synthesize-btn');
    // 合成完了 = 「合成中...」解除 + 比較ボタン活性化
    await expect(page.locator('#compare-btn')).toBeEnabled({ timeout: 10000 });
    await expect(page.locator('#synthesize-btn')).toHaveText('🔊 合成再生');

    await page.click('#compare-btn');
    await expect(page.locator('#status-message')).toHaveText(/原音の再生が完了しました/, {
      timeout: 6000,
    });

    await page.click('#sine-wave-btn');
    await expect(page.locator('#status-message')).toHaveText(/個の正弦波を停止しました/);

    tracker.assertClean();
  });
});

test.describe('branch: individual checkbox -> play -> deselect all -> stop', () => {
  test('exercises the individual-selection listener and stop paths', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'tone', 'requires tone-440hz fixture');
    const tracker = trackConsoleAndPageErrors(page);
    await initAndRecord(page);

    await page.click('#analyse-btn');
    await expect(page.locator('#sine-waves-list li').first()).toBeVisible({ timeout: 15000 });

    await page.check('#sine-wave-0');
    await expect(page.locator('#sine-wave-0')).toBeChecked();

    await page.click('#auto-deselect-btn');
    await expect(page.locator('#sine-wave-0')).not.toBeChecked();

    await page.click('#sine-wave-btn');
    await expect(page.locator('#status-message')).toHaveText(/個の正弦波を停止しました/);

    tracker.assertClean();
  });
});

test.describe('branch: silence fixture -> 0 components -> test-wave fallback', () => {
  test('falls back to fixed test frequencies when no components are found', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'silence', 'requires silence fixture');
    const tracker = trackConsoleAndPageErrors(page);
    await initAndRecord(page);

    await page.click('#analyse-btn');
    await expect(page.locator('#sine-waves-list li').first()).toBeVisible({ timeout: 15000 });

    const checkboxIds = await page
      .locator('#sine-waves-list input')
      .evaluateAll((els) => els.map((el) => (el as HTMLInputElement).id));
    expect(checkboxIds).toEqual(['test-wave-0', 'test-wave-1', 'test-wave-2']);

    await page.check('#test-wave-0');
    await expect(page.locator('#test-wave-0')).toBeChecked();

    await page.click('#auto-deselect-btn');
    await expect(page.locator('#test-wave-0')).not.toBeChecked();

    await page.click('#sine-wave-btn');

    tracker.assertClean();
  });
});
