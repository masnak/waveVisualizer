// dsp.ts のユニットテスト（計画 1.4-E / M2-7）。
// - golden-vector: 固定の多成分・位相付き合成信号の出力を rel 1e-6 でロック（回帰ゲート）
// - 解析的期待値: bin 中心の単一正弦波で振幅・位相の理論値を検証
// - 8kHz 境界値: 直下/直上での 10 倍厳格化閾値の挙動を検証
import { describe, expect, it } from 'vitest';
import { analyseFrequencyComponents } from './dsp.js';

function buildSignal(
  length: number,
  sampleRate: number,
  parts: { freq: number; amp: number; phase: number }[],
): Float32Array {
  const data = new Float32Array(length);
  for (let n = 0; n < length; n++) {
    let v = 0;
    for (const p of parts) {
      v += p.amp * Math.sin((2 * Math.PI * p.freq * n) / sampleRate + p.phase);
    }
    data[n] = v;
  }
  return data;
}

function expectRelClose(actual: number, expected: number, rel = 1e-6) {
  if (expected === 0) {
    expect(Math.abs(actual)).toBeLessThan(1e-9);
    return;
  }
  const relError = Math.abs((actual - expected) / expected);
  expect(relError).toBeLessThan(rel);
}

describe('analyseFrequencyComponents - golden vector', () => {
  // 固定入力: sampleRate=8000, fftSize=512（bin 分解能 15.625Hz）。
  // bin 8/16/32 = 125/250/500Hz に位相付き 3 成分を合成。ハミング窓の
  // サイドローブ漏れにより実際には 9 成分が閾値を超えて検出される
  // （これも含めて固定するのが golden-vector の目的）。
  const sampleRate = 8000;
  const fftSize = 512;
  const data = buildSignal(fftSize, sampleRate, [
    { freq: 125, amp: 1.0, phase: 0 },
    { freq: 250, amp: 0.5, phase: Math.PI / 4 },
    { freq: 500, amp: 0.25, phase: Math.PI / 2 },
  ]);

  const expected = [
    {
      frequency: 125,
      rawAmplitude: 0.5000010967853273,
      phase: -1.5707862229543477,
      amplitude: 0,
    },
    {
      frequency: 250,
      rawAmplitude: 0.2500092686354298,
      phase: -0.7854263727566501,
      amplitude: -6.020296946962914,
    },
    {
      frequency: 109.375,
      rawAmplitude: 0.21352551507055362,
      phase: 1.5646413098454297,
      amplitude: -7.3904235767355715,
    },
    {
      frequency: 140.625,
      rawAmplitude: 0.2135219950785986,
      phase: 1.5769019302041216,
      amplitude: -7.3905667657762395,
    },
    {
      frequency: 500,
      rawAmplitude: 0.125001486045668,
      phase: -0.000014341238164259577,
      amplitude: -12.041115619235413,
    },
    {
      frequency: 265.625,
      rawAmplitude: 0.10675517023065757,
      phase: 2.362378965714797,
      amplitude: -13.411640791721807,
    },
    {
      frequency: 234.375,
      rawAmplitude: 0.10675036970907661,
      phase: 2.3501503017168917,
      amplitude: -13.412031383934785,
    },
    {
      frequency: 515.625,
      rawAmplitude: 0.05337994391766887,
      phase: -3.1354268870330193,
      amplitude: -19.43185687639481,
    },
    {
      frequency: 484.375,
      rawAmplitude: 0.053379589042122866,
      phase: 3.1354948255739874,
      amplitude: -19.431914621305125,
    },
  ];

  it('locks maxAmplitude and the full component list (rel 1e-6)', () => {
    const result = analyseFrequencyComponents(data, sampleRate, fftSize);

    expectRelClose(result.maxAmplitude, 0.5000010967853273);
    expect(result.components).toHaveLength(expected.length);

    result.components.forEach((component, i) => {
      const exp = expected[i];
      expect(component.frequency).toBe(exp.frequency);
      expectRelClose(component.rawAmplitude, exp.rawAmplitude);
      expectRelClose(component.phase, exp.phase);
      if (exp.amplitude === 0) {
        expect(component.amplitude).toBe(0);
      } else {
        expectRelClose(component.amplitude, exp.amplitude);
      }
    });
  });

  it('is deterministic across repeated calls', () => {
    const a = analyseFrequencyComponents(data, sampleRate, fftSize);
    const b = analyseFrequencyComponents(data, sampleRate, fftSize);
    expect(a).toEqual(b);
  });
});

describe('analyseFrequencyComponents - analytical expectations', () => {
  const sampleRate = 8000;
  const fftSize = 512;

  it('recovers amplitude ~= A/2 for a bin-centered sinusoid', () => {
    const data = buildSignal(fftSize, sampleRate, [{ freq: 125, amp: 1.0, phase: 0 }]);
    const result = analyseFrequencyComponents(data, sampleRate, fftSize);
    const top = result.components[0];
    expect(top.frequency).toBe(125);
    expectRelClose(top.rawAmplitude, 0.5, 1e-3);
  });

  it('recovers phase = -PI/2 for sin(...) input with phase 0 (implementation-documented behavior)', () => {
    const data = buildSignal(fftSize, sampleRate, [{ freq: 125, amp: 1.0, phase: 0 }]);
    const result = analyseFrequencyComponents(data, sampleRate, fftSize);
    expect(result.components[0].phase).toBeCloseTo(-Math.PI / 2, 3);
  });

  it.each([0, Math.PI / 6, Math.PI / 2, Math.PI, -Math.PI / 3])(
    'recovers phase = atan2(-cos(phi), sin(phi)) for input phase %f',
    (phase) => {
      const data = buildSignal(fftSize, sampleRate, [{ freq: 125, amp: 1.0, phase }]);
      const result = analyseFrequencyComponents(data, sampleRate, fftSize);
      const expectedPhase = Math.atan2(-Math.cos(phase), Math.sin(phase));
      expect(result.components[0].phase).toBeCloseTo(expectedPhase, 3);
    },
  );
});

describe('analyseFrequencyComponents - 8kHz boundary (10x stricter threshold above 8kHz)', () => {
  // sampleRate=44100, fftSize=1024 (分解能 43.0664Hz)。anchor はサイドローブ
  // 干渉を避けるため境界から離れた低周波（bin 23, ~990.5Hz）に配置。
  // below=bin185(~7967.29Hz, 8kHz直下) / above=bin186(~8010.35Hz, 8kHz直上)。
  const sampleRate = 44100;
  const fftSize = 1024;
  const anchorFreq = 23 * (sampleRate / fftSize);
  const belowFreq = 185 * (sampleRate / fftSize);
  const aboveFreq = 186 * (sampleRate / fftSize);

  function analyseWithTarget(targetFreq: number, targetAmp: number) {
    const data = buildSignal(fftSize, sampleRate, [
      { freq: anchorFreq, amp: 1.0, phase: 0.3 },
      { freq: targetFreq, amp: targetAmp, phase: 0.7 },
    ]);
    const result = analyseFrequencyComponents(data, sampleRate, fftSize);
    return result.components.find((c) => Math.abs(c.frequency - targetFreq) < 1);
  }

  it('keeps a component just below 8kHz at an amplitude that would be rejected just above 8kHz', () => {
    const below = analyseWithTarget(belowFreq, 0.003);
    const above = analyseWithTarget(aboveFreq, 0.003);

    expect(below).toBeDefined();
    expect(above).toBeUndefined();
  });

  it('keeps a component just above 8kHz once it clears the 10x-stricter threshold', () => {
    const above = analyseWithTarget(aboveFreq, 0.03);
    expect(above).toBeDefined();
  });
});
