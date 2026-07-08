// sinewaveAnalyser.js の synthesizeSelectedComponents() / calculateSynthesisWaveform() から
// 純粋計算部分を抽出（M2-10）。表示パスと音声パスの正規化は計画 1.4-E の方針通り
// 別々の関数のまま統合しない。
import type { CheckboxState, FrequencyComponent, SynthesisComponent } from '../types.js';

// テスト用固定周波数（元コードの displaySineWaves / calculateSynthesisWaveform に
// 重複していた定数をここに一本化）
const TEST_WAVE_FREQUENCIES: { frequency: number; phase: number; relativeAmplitude: number }[] = [
  { frequency: 440, phase: 0, relativeAmplitude: 1.0 },
  { frequency: 880, phase: Math.PI / 4, relativeAmplitude: 0.5 },
  { frequency: 1320, phase: Math.PI / 2, relativeAmplitude: 0.25 },
];

/**
 * チェックボックス選択状態から合成対象の成分を収集する（計画 1.2）。
 * DOM 要素ではなくプレーンデータ（CheckboxState[]）を受け取る純粋関数。
 * 「2 箇所の重複統合」ではなく「共通選択ロジック + includeTestWaves パラメータ」として
 * 抽出する。音声パス = includeTestWaves:false（test-wave-* を含めない）、
 * 表示パス = includeTestWaves:true（test-wave-* を含める）という現行の意図された
 * 非対称を保存する。
 */
export function collectSelectedComponents(
  checkboxes: CheckboxState[],
  frequencyComponents: FrequencyComponent[],
  maxAnalysisAmplitude: number,
  includeTestWaves: boolean,
): SynthesisComponent[] {
  const selected: SynthesisComponent[] = [];

  for (const checkbox of checkboxes) {
    if (checkbox.checked && checkbox.id.startsWith('sine-wave-')) {
      const index = parseInt(checkbox.id.replace('sine-wave-', ''));
      if (frequencyComponents[index]) {
        selected.push(frequencyComponents[index]);
      }
    } else if (includeTestWaves && checkbox.checked && checkbox.id.startsWith('test-wave-')) {
      const index = parseInt(checkbox.id.replace('test-wave-', ''));
      const testFreq = TEST_WAVE_FREQUENCIES[index];
      if (testFreq) {
        selected.push({
          frequency: testFreq.frequency,
          rawAmplitude: (maxAnalysisAmplitude || 0.1) * testFreq.relativeAmplitude,
          phase: testFreq.phase,
        });
      }
    }
  }

  return selected;
}

/**
 * 音声パス: 選択成分を位相付きで加算合成し、人間の声向けの適応的正規化を適用した
 * サンプル列を返す（synthesizeSelectedComponents() のコア計算、元 main.js から
 * そのまま複製）。
 */
export function synthesizeAudioSamples(
  components: SynthesisComponent[],
  sampleRate: number,
  durationSeconds: number,
  maxAnalysisAmplitude: number,
): Float32Array {
  const length = Math.floor(durationSeconds * sampleRate);
  const data = new Float32Array(length);

  for (const comp of components) {
    const relativeAmplitude = comp.rawAmplitude / maxAnalysisAmplitude;

    let baseGainLevel: number;
    if (relativeAmplitude > 0.5) {
      baseGainLevel = 0.4; // 主要成分
    } else if (relativeAmplitude > 0.1) {
      baseGainLevel = 0.3; // 重要成分
    } else {
      baseGainLevel = 0.2; // 補助成分
    }

    let gainValue = relativeAmplitude * baseGainLevel;
    gainValue = Math.max(gainValue, 0.002); // 最小音量を上げる
    gainValue = Math.min(gainValue, 0.6); // 最大音量を上げる

    for (let i = 0; i < length; i++) {
      const time = i / sampleRate;
      data[i] += gainValue * Math.sin(2 * Math.PI * comp.frequency * time + comp.phase);
    }
  }

  // 合成後の波形統計
  let maxSample = 0;
  let minSample = 0;
  let rmsSum = 0;
  for (let i = 0; i < length; i++) {
    const sample = data[i];
    if (sample > maxSample) maxSample = sample;
    if (sample < minSample) minSample = sample;
    rmsSum += sample * sample;
  }
  const rmsLevel = Math.sqrt(rmsSum / length);

  // 適応的正規化（人間の声に適した音量に調整）
  let normalizationFactor = 1.0;
  const targetRMS = 0.1; // 目標RMSレベル

  if (rmsLevel > 0) {
    if (maxSample > 0.8) {
      // クリッピング防止
      normalizationFactor = 0.8 / Math.max(Math.abs(maxSample), Math.abs(minSample));
    } else if (rmsLevel < targetRMS * 0.1) {
      // 音量が小さすぎる場合の増幅
      normalizationFactor = Math.min(targetRMS / rmsLevel, 5.0); // 最大5倍まで
    }
  }

  if (normalizationFactor !== 1.0) {
    for (let i = 0; i < length; i++) {
      data[i] *= normalizationFactor;
    }
  }

  return data;
}

/**
 * 表示パス: 選択成分から合成波形の静的表示用データを計算する
 * （calculateSynthesisWaveform() のコア計算、元 main.js からそのまま複製）。
 * sampleRate は引数化しつつデフォルト 44100 で挙動維持（計画 1.4-E、既知バグ-2:
 * 音声パスの実 sampleRate との不一致は温存）。
 */
export function calculateDisplaySynthesisWaveform(
  components: SynthesisComponent[],
  sampleRate = 44100,
): Float32Array {
  if (components.length === 0) {
    return new Float32Array(0);
  }

  const displayDuration = 0.2; // 200ms分の波形を表示
  const prepareDuration = 0.1; // 100ms分の準備時間（定常状態確保のため）
  const totalDuration = displayDuration + prepareDuration;
  const totalLength = Math.floor(sampleRate * totalDuration);
  const displayLength = Math.floor(sampleRate * displayDuration);
  const prepareLength = Math.floor(sampleRate * prepareDuration);

  const fullSynthesisData = new Float32Array(totalLength);
  const amplitudeScale = 1000; // rawAmplitudeを増幅

  for (const comp of components) {
    const rawAmp = comp.rawAmplitude || 0;
    const amplitude = rawAmp * amplitudeScale;
    const phase = comp.phase || 0;

    for (let i = 0; i < totalLength; i++) {
      const time = i / sampleRate;
      fullSynthesisData[i] += amplitude * Math.sin(2 * Math.PI * comp.frequency * time + phase);
    }
  }

  // 定常状態部分（準備時間後）を表示用データとして抽出
  const synthesisData = new Float32Array(displayLength);
  for (let i = 0; i < displayLength; i++) {
    synthesisData[i] = fullSynthesisData[prepareLength + i];
  }

  // 実際の振幅に基づいて正規化
  let actualMax = 0;
  let actualMin = 0;
  for (let i = 0; i < displayLength; i++) {
    if (synthesisData[i] > actualMax) actualMax = synthesisData[i];
    if (synthesisData[i] < actualMin) actualMin = synthesisData[i];
  }
  const actualRange = Math.max(Math.abs(actualMax), Math.abs(actualMin));

  if (actualRange > 0) {
    const normalizeByActual = 0.8; // クリッピング防止
    for (let i = 0; i < displayLength; i++) {
      synthesisData[i] = (synthesisData[i] / actualRange) * normalizeByActual;
    }
  }

  return synthesisData;
}
