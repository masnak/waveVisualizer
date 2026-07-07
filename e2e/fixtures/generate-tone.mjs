// Regenerates the WAV fixtures used by Playwright's fake-audio-capture flag.
// Run with: node e2e/fixtures/generate-tone.mjs
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SAMPLE_RATE = 48000;
const DURATION_SECONDS = 3;
const FADE_SECONDS = 0.02;
const AMPLITUDE = 0.5;
const TONE_FREQUENCY_HZ = 440;

function encodeWav(samples, sampleRate) {
  const numSamples = samples.length;
  const bytesPerSample = 2;
  const blockAlign = bytesPerSample; // mono
  const byteRate = sampleRate * blockAlign;
  const dataSize = numSamples * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write('RIFF', 0, 'ascii');
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8, 'ascii');
  buffer.write('fmt ', 12, 'ascii');
  buffer.writeUInt32LE(16, 16); // fmt chunk size
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // mono
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(16, 34); // bits per sample
  buffer.write('data', 36, 'ascii');
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < numSamples; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    const intSample = Math.round(clamped * 32767);
    buffer.writeInt16LE(intSample, 44 + i * bytesPerSample);
  }

  return buffer;
}

function fadeGain(sampleIndex, numSamples, fadeSamples) {
  if (sampleIndex < fadeSamples) {
    return sampleIndex / fadeSamples;
  }
  if (sampleIndex >= numSamples - fadeSamples) {
    return (numSamples - 1 - sampleIndex) / fadeSamples;
  }
  return 1;
}

function generateTone() {
  const numSamples = Math.round(SAMPLE_RATE * DURATION_SECONDS);
  const fadeSamples = Math.round(SAMPLE_RATE * FADE_SECONDS);
  const samples = new Float64Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    const gain = fadeGain(i, numSamples, fadeSamples);
    samples[i] = AMPLITUDE * gain * Math.sin(2 * Math.PI * TONE_FREQUENCY_HZ * t);
  }
  return samples;
}

function generateSilence() {
  const numSamples = Math.round(SAMPLE_RATE * DURATION_SECONDS);
  return new Float64Array(numSamples);
}

const tonePath = fileURLToPath(new URL('./tone-440hz.wav', import.meta.url));
const silencePath = fileURLToPath(new URL('./silence.wav', import.meta.url));

writeFileSync(tonePath, encodeWav(generateTone(), SAMPLE_RATE));
writeFileSync(silencePath, encodeWav(generateSilence(), SAMPLE_RATE));

console.log(`Wrote ${tonePath}`);
console.log(`Wrote ${silencePath}`);
