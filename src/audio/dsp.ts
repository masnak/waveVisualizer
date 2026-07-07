// sinewaveAnalyser.js の analyseRecording() から DFT・ハミング窓・動的閾値・8kHz
// フィルタ・dB 変換のロジックをそのまま複製した純粋関数（M2-7、born-ESM）。
// 唯一の変換は maxAnalysisAmplitude のグローバル書込 → 戻り値化（計画 1.4-E）。
// fftSize / sampleRate は引数注入。この時点ではアプリからは未参照（差し替えは M2-8）。
import type { AnalysisResult, FrequencyComponent } from '../types.js';

export function analyseFrequencyComponents(
  channelData: Float32Array,
  sampleRate: number,
  fftSize = 16384,
): AnalysisResult {
  // 音声データの統計情報を計算
  let maxAmplitude = 0;
  let rmsAmplitude = 0;

  for (let i = 0; i < channelData.length; i++) {
    const val = Math.abs(channelData[i]);
    if (val > maxAmplitude) maxAmplitude = val;
    rmsAmplitude += val * val;
  }
  rmsAmplitude = Math.sqrt(rmsAmplitude / channelData.length);

  console.log('Audio data statistics:', {
    maxAmplitude,
    rmsAmplitude,
    totalSamples: channelData.length,
  });

  // 位相情報保持のための改善された DFT 実装
  const windowSize = Math.min(fftSize, channelData.length);

  // ハミング窓を適用
  const window = new Float32Array(windowSize);
  for (let i = 0; i < windowSize; i++) {
    window[i] = 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (windowSize - 1));
  }

  // 窓関数の正規化係数を計算
  let windowSum = 0;
  for (let i = 0; i < windowSize; i++) {
    windowSum += window[i];
  }
  const windowNormalization = windowSize / windowSum;

  // 位相情報付き DFT 実行
  const frequencyData: { amplitude: number; phase: number; real: number; imag: number }[] = [];
  let maxAnalysisAmplitude = 0;

  for (let k = 0; k < fftSize / 2; k++) {
    let realSum = 0;
    let imagSum = 0;

    for (let n = 0; n < windowSize; n++) {
      const angle = (-2 * Math.PI * k * n) / fftSize;
      const windowedSample = channelData[n] * window[n];
      realSum += windowedSample * Math.cos(angle);
      imagSum += windowedSample * Math.sin(angle);
    }

    // 振幅と位相を計算
    const magnitude = Math.sqrt(realSum * realSum + imagSum * imagSum);
    const phase = Math.atan2(imagSum, realSum);
    const amplitude = (magnitude * windowNormalization) / windowSize;

    if (amplitude > maxAnalysisAmplitude) {
      maxAnalysisAmplitude = amplitude;
    }

    frequencyData.push({ amplitude, phase, real: realSum, imag: imagSum });
  }

  console.log('Phase-preserving FFT analysis completed');
  console.log(`Maximum analysis amplitude: ${maxAnalysisAmplitude.toExponential(3)}`);
  console.log(
    'Sample phase data:',
    frequencyData
      .slice(1, 6)
      .map((f) => `${f.amplitude.toExponential(2)} @ ${((f.phase * 180) / Math.PI).toFixed(1)}°`),
  );

  const sineWaves: FrequencyComponent[] = [];
  const nyquistFreq = sampleRate / 2;

  // 位相情報保持のための動的閾値
  let avgFreqAmplitude = 0;
  let nonZeroCount = 0;

  for (let i = 1; i < frequencyData.length; i++) {
    if (frequencyData[i].amplitude > 0) {
      avgFreqAmplitude += frequencyData[i].amplitude;
      nonZeroCount++;
    }
  }
  avgFreqAmplitude = nonZeroCount > 0 ? avgFreqAmplitude / nonZeroCount : 0;

  const dynamicThreshold = Math.max(
    avgFreqAmplitude * 0.02,
    maxAnalysisAmplitude * 0.001,
    0.00000001,
  );

  console.log('Dynamic threshold for phase preservation:', dynamicThreshold.toExponential(3));
  console.log(
    `FFT解析詳細: サンプルレート=${sampleRate}Hz, FFTサイズ=${fftSize}, ナイキスト周波数=${nyquistFreq}Hz`,
  );
  console.log(`周波数分解能: ${sampleRate / fftSize}Hz, 解析範囲: 0-${nyquistFreq}Hz`);

  // 各周波数ビンを位相情報付きで分析
  for (let i = 1; i < frequencyData.length; i++) {
    const frequency = (i * nyquistFreq) / (fftSize / 2);
    const freqData = frequencyData[i];

    // 不正な高周波成分の検出とログ出力
    if (frequency > 5000 && freqData.amplitude > dynamicThreshold) {
      console.warn(
        `不正な高周波成分検出: ${frequency.toFixed(1)}Hz, 振幅=${freqData.amplitude.toExponential(3)}`,
      );
    }

    // dB 変換（表示用）
    let amplitudeDB: number;
    if (freqData.amplitude > 0) {
      amplitudeDB = 20 * Math.log10(freqData.amplitude / maxAnalysisAmplitude);
    } else {
      amplitudeDB = -Infinity;
    }

    // 位相情報と振幅情報を保持（ただし人間の声の範囲内のみ）
    if (
      freqData.amplitude > dynamicThreshold &&
      isFinite(amplitudeDB) &&
      frequency <= nyquistFreq
    ) {
      // 人間の声の範囲外の高周波成分をフィルタリング
      if (frequency > 8000) {
        // 8kHz 以上の成分に対して更に厳しい閾値を適用
        const highFreqThreshold = dynamicThreshold * 10; // 10 倍厳しい閾値
        if (freqData.amplitude < highFreqThreshold) {
          continue; // この成分をスキップ
        }
        console.log(`高周波成分保持: ${frequency.toFixed(1)}Hz (強い成分のため)`);
      }

      sineWaves.push({
        frequency,
        amplitude: amplitudeDB,
        rawAmplitude: freqData.amplitude,
        phase: freqData.phase,
      });
    }
  }

  console.log('Sine waves found with phase information:', sineWaves.length, 'components');

  // 振幅順にソート
  sineWaves.sort((a, b) => b.rawAmplitude - a.rawAmplitude);

  const components = sineWaves.slice(0, Math.min(100, sineWaves.length));

  console.log(`Phase-preserving analysis complete. Displaying ${components.length} components`);
  console.log(`Reference amplitude: ${maxAnalysisAmplitude.toExponential(3)}`);

  return { components, maxAmplitude: maxAnalysisAmplitude };
}
