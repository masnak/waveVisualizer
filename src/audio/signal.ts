// sinewaveAnalyser.js の playSineWave() が持っていたサンプル生成ループを純粋関数として
// 抽出（M2-10、計画 1.4-E）。位相付き単一正弦波のサンプル列を生成する。
export function renderSineSamples(
  length: number,
  sampleRate: number,
  frequency: number,
  gainValue: number,
  phase: number,
): Float32Array {
  const data = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const time = i / sampleRate;
    data[i] = gainValue * Math.sin(2 * Math.PI * frequency * time + phase);
  }
  return data;
}
