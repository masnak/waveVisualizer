import { describe, expect, it } from 'vitest';
import {
  calculateDisplaySynthesisWaveform,
  collectSelectedComponents,
  synthesizeAudioSamples,
} from './synthesis.js';
import type { CheckboxState, FrequencyComponent } from '../types.js';

const frequencyComponents: FrequencyComponent[] = [
  { frequency: 440, amplitude: 0, rawAmplitude: 0.5, phase: 0 },
  { frequency: 880, amplitude: -6, rawAmplitude: 0.25, phase: Math.PI / 4 },
];

describe('collectSelectedComponents', () => {
  it('returns empty array for no checkboxes', () => {
    expect(collectSelectedComponents([], frequencyComponents, 0.5, true)).toEqual([]);
  });

  it('includes checked sine-wave-* checkboxes matching a known index', () => {
    const checkboxes: CheckboxState[] = [
      { id: 'sine-wave-0', checked: true },
      { id: 'sine-wave-1', checked: false },
    ];
    const result = collectSelectedComponents(checkboxes, frequencyComponents, 0.5, true);
    expect(result).toEqual([frequencyComponents[0]]);
  });

  it('skips sine-wave-* checkboxes with an out-of-range index', () => {
    const checkboxes: CheckboxState[] = [{ id: 'sine-wave-99', checked: true }];
    expect(collectSelectedComponents(checkboxes, frequencyComponents, 0.5, true)).toEqual([]);
  });

  it('ignores unrelated checkbox ids', () => {
    const checkboxes: CheckboxState[] = [{ id: 'some-other-checkbox', checked: true }];
    expect(collectSelectedComponents(checkboxes, frequencyComponents, 0.5, true)).toEqual([]);
  });

  it('excludes test-wave-* when includeTestWaves=false (audio path asymmetry)', () => {
    const checkboxes: CheckboxState[] = [{ id: 'test-wave-0', checked: true }];
    expect(collectSelectedComponents(checkboxes, [], 0.5, false)).toEqual([]);
  });

  it('includes test-wave-* when includeTestWaves=true (display path)', () => {
    const checkboxes: CheckboxState[] = [
      { id: 'test-wave-0', checked: true },
      { id: 'test-wave-1', checked: true },
      { id: 'test-wave-2', checked: false },
    ];
    const result = collectSelectedComponents(checkboxes, [], 0.8, true);
    expect(result).toEqual([
      { frequency: 440, rawAmplitude: 0.8 * 1.0, phase: 0 },
      { frequency: 880, rawAmplitude: 0.8 * 0.5, phase: Math.PI / 4 },
    ]);
  });

  it('falls back to 0.1 base amplitude for test waves when maxAnalysisAmplitude is 0', () => {
    const checkboxes: CheckboxState[] = [{ id: 'test-wave-0', checked: true }];
    const result = collectSelectedComponents(checkboxes, [], 0, true);
    expect(result[0].rawAmplitude).toBeCloseTo(0.1 * 1.0, 12);
  });

  it('mixes sine-wave and test-wave selections when includeTestWaves=true', () => {
    const checkboxes: CheckboxState[] = [
      { id: 'sine-wave-1', checked: true },
      { id: 'test-wave-2', checked: true },
    ];
    const result = collectSelectedComponents(checkboxes, frequencyComponents, 1.0, true);
    expect(result).toEqual([
      frequencyComponents[1],
      { frequency: 1320, rawAmplitude: 1.0 * 0.25, phase: Math.PI / 2 },
    ]);
  });
});

describe('synthesizeAudioSamples', () => {
  it('returns an all-zero buffer of the correct length for no components', () => {
    const result = synthesizeAudioSamples([], 8000, 2, 1.0);
    expect(result.length).toBe(16000);
    expect(Array.from(result).every((v) => v === 0)).toBe(true);
  });

  it('produces finite, non-NaN samples for a single dominant component', () => {
    const result = synthesizeAudioSamples(
      [{ frequency: 440, rawAmplitude: 1.0, phase: 0 }],
      8000,
      0.1,
      1.0,
    );
    expect(result.length).toBe(800);
    expect(result.every((v) => Number.isFinite(v))).toBe(true);
    // 主要成分(relativeAmplitude=1 > 0.5 => baseGainLevel=0.4)のクリッピング防止後、
    // 振幅は 0.8 を明確に超えない
    expect(Math.max(...result.map(Math.abs))).toBeLessThanOrEqual(0.81);
  });

  it('is deterministic across repeated calls with identical input', () => {
    const components = [{ frequency: 440, rawAmplitude: 0.3, phase: 0.5 }];
    const a = synthesizeAudioSamples(components, 8000, 0.05, 1.0);
    const b = synthesizeAudioSamples(components, 8000, 0.05, 1.0);
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it('amplifies a very quiet component toward the target RMS (small-signal branch)', () => {
    // relativeAmplitude = 0.001 / 1.0 = 0.001 -> baseGainLevel=0.2 -> raw gain very
    // small -> clamped to minimum 0.002 -> RMS well below target -> amplification applies
    const result = synthesizeAudioSamples(
      [{ frequency: 440, rawAmplitude: 0.001, phase: 0 }],
      8000,
      0.1,
      1.0,
    );
    let rmsSum = 0;
    for (const v of result) rmsSum += v * v;
    const rms = Math.sqrt(rmsSum / result.length);
    expect(rms).toBeGreaterThan(0);
    expect(Number.isFinite(rms)).toBe(true);
  });
});

describe('calculateDisplaySynthesisWaveform', () => {
  it('returns an empty array for no components', () => {
    expect(calculateDisplaySynthesisWaveform([]).length).toBe(0);
  });

  it('returns displayLength samples (200ms at the given sample rate)', () => {
    const result = calculateDisplaySynthesisWaveform(
      [{ frequency: 440, rawAmplitude: 0.5, phase: 0 }],
      44100,
    );
    expect(result.length).toBe(Math.floor(44100 * 0.2));
  });

  it('defaults sampleRate to 44100 when omitted (existing behavior preserved, known bug-2)', () => {
    const withDefault = calculateDisplaySynthesisWaveform([
      { frequency: 440, rawAmplitude: 0.5, phase: 0 },
    ]);
    const withExplicit44100 = calculateDisplaySynthesisWaveform(
      [{ frequency: 440, rawAmplitude: 0.5, phase: 0 }],
      44100,
    );
    expect(Array.from(withDefault)).toEqual(Array.from(withExplicit44100));
  });

  it('normalizes non-zero output to within [-0.8, 0.8]', () => {
    const result = calculateDisplaySynthesisWaveform([
      { frequency: 440, rawAmplitude: 0.5, phase: 0 },
      { frequency: 880, rawAmplitude: 0.25, phase: Math.PI / 3 },
    ]);
    const maxAbs = Math.max(...Array.from(result).map(Math.abs));
    // Float32Array は単精度のため許容誤差もそれに合わせる
    expect(maxAbs).toBeLessThanOrEqual(0.8 + 1e-6);
    expect(maxAbs).toBeGreaterThan(0);
  });

  it('is deterministic across repeated calls with identical input', () => {
    const components = [{ frequency: 660, rawAmplitude: 0.4, phase: 1.1 }];
    const a = calculateDisplaySynthesisWaveform(components);
    const b = calculateDisplaySynthesisWaveform(components);
    expect(Array.from(a)).toEqual(Array.from(b));
  });
});
