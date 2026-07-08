import { describe, expect, it } from 'vitest';
import { renderSineSamples } from './signal.js';

describe('renderSineSamples', () => {
  it('generates the expected length', () => {
    const samples = renderSineSamples(100, 8000, 440, 0.5, 0);
    expect(samples.length).toBe(100);
  });

  it('matches the analytical sine formula sample-by-sample', () => {
    const length = 10;
    const sampleRate = 8000;
    const frequency = 440;
    const gain = 0.5;
    const phase = Math.PI / 4;

    const samples = renderSineSamples(length, sampleRate, frequency, gain, phase);

    for (let i = 0; i < length; i++) {
      const time = i / sampleRate;
      const expected = gain * Math.sin(2 * Math.PI * frequency * time + phase);
      // Float32Array は単精度（~7 桁）のため許容誤差もそれに合わせる
      expect(samples[i]).toBeCloseTo(expected, 6);
    }
  });

  it('starts at gain * sin(phase) for i=0', () => {
    const samples = renderSineSamples(1, 8000, 440, 0.5, Math.PI / 2);
    expect(samples[0]).toBeCloseTo(0.5 * Math.sin(Math.PI / 2), 6);
  });

  it('is zero-length for length=0', () => {
    const samples = renderSineSamples(0, 8000, 440, 0.5, 0);
    expect(samples.length).toBe(0);
  });
});
