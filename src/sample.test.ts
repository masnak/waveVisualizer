// Vitest 導入確認用の scaffold テスト。M2-7 で dsp.ts のユニットテストが
// 追加され次第この placeholder は削除する（.ai-workspace/progress-20260707-001-*.md 参照）。
import { describe, expect, it } from 'vitest';

describe('vitest scaffold (node environment)', () => {
  it('runs without a DOM', () => {
    expect(typeof window).toBe('undefined');
    expect(1 + 1).toBe(2);
  });
});
