// sinewaveAnalyser.js から born-ESM へ複製（M2-8）。挙動は維持しつつ 2 点を変換:
// ① audioContext / recordedChunks は state.ts 経由（1.4-A 移行期の例外）
// ② analyseRecording() の DFT 計算部分は dsp.ts の analyseFrequencyComponents() 呼び出しへ差し替え
//    （計画通り、この差し替えを golden-vector が保護する）
// showStatusMessage は ui/status.ts から import（main.ts も同じ関数を import する）。
import { state } from './state.js';
import { showStatusMessage } from './ui/status.js';
import { analyseFrequencyComponents } from './audio/dsp.js';
import { renderSineSamples } from './audio/signal.js';
import {
  calculateDisplaySynthesisWaveform,
  collectSelectedComponents,
  synthesizeAudioSamples,
} from './audio/synthesis.js';
import type { CheckboxState, FrequencyComponent } from './types.js';

// 選択状態の読み取りシム（計画 1.4-A 点4: 「読み取りシムで境界を1箇所に固定」）。
// .checked は DOM 所有のままとし、純粋関数 collectSelectedComponents への
// 唯一の橋渡しをここに集約する。
function readCheckboxStates(): CheckboxState[] {
  const sineWavesList = document.getElementById('sine-waves-list')!;
  const checkboxes = sineWavesList.getElementsByTagName('input');
  return Array.from(checkboxes).map((checkbox) => ({
    id: checkbox.id,
    checked: checkbox.checked,
  }));
}

// グローバル変数：解析結果の最大振幅を保存（相対音量計算用）
let maxAnalysisAmplitude = 0;
// グローバル変数：位相情報付き周波数成分を保存
let frequencyComponents: FrequencyComponent[] = [];
// グローバル変数：合成音声用AudioBuffer
let synthesizedBuffer: AudioBuffer | null = null;

interface SineWavePlayer {
  source: AudioBufferSourceNode;
  buffer: AudioBuffer;
  frequency: number;
  amplitude: number;
  rawAmplitude: number;
  phase: number;
  gainValue: number;
  stop: () => void;
}

type CheckboxWithPlayer = HTMLInputElement & { sineWavePlayer?: SineWavePlayer | null };

// 位相情報付きサイン波を再生するための関数
async function playSineWave(
  frequency: number,
  amplitude: number,
  rawAmplitude: number,
  phase = 0,
): Promise<SineWavePlayer | null> {
  try {
    console.log(
      `Creating sine wave: ${frequency.toFixed(2)} Hz, phase: ${phase.toFixed(3)} rad (${((phase * 180) / Math.PI).toFixed(1)}°)`,
    );

    // 短い時間の位相制御可能なAudioBufferを生成
    const duration = 5; // 5秒間の連続再生
    const sampleRate = state.audioContext!.sampleRate;
    const length = Math.floor(duration * sampleRate);
    const buffer = state.audioContext!.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);

    // 相対振幅を正確に保持した音量計算
    let gainValue: number;
    if (maxAnalysisAmplitude > 0 && rawAmplitude > 0) {
      const relativeAmplitude = rawAmplitude / maxAnalysisAmplitude;
      const baseGainLevel = 0.15;
      gainValue = relativeAmplitude * baseGainLevel;
      gainValue = Math.max(gainValue, 0.001);
      gainValue = Math.min(gainValue, 0.3);
    } else {
      gainValue = 0.05;
    }

    // 位相を考慮した正弦波を生成（audio/signal.ts, M2-10）
    data.set(renderSineSamples(length, sampleRate, frequency, gainValue, phase));

    // AudioBufferSourceNodeで再生
    const source = state.audioContext!.createBufferSource();
    source.buffer = buffer;
    source.connect(state.audioContext!.destination);

    // Audio contextの状態を確認
    if (state.audioContext!.state === 'suspended') {
      await state.audioContext!.resume();
    }

    source.start();
    console.log(
      `Phase-controlled sine wave started: ${frequency.toFixed(2)} Hz, phase: ${phase.toFixed(3)} rad, gain: ${gainValue.toFixed(6)}`,
    );

    return {
      source,
      buffer,
      frequency,
      amplitude,
      rawAmplitude,
      phase,
      gainValue,
      stop: () => {
        try {
          source.stop();
          console.log(`Sine wave stopped: ${frequency.toFixed(2)} Hz`);
        } catch {
          console.log('Source already stopped');
        }
      },
    };
  } catch (error) {
    console.error('Error creating phase-controlled sine wave:', error);
    return null;
  }
}

// 位相情報付き音声合成（選択された成分から完全な音声を生成）
async function synthesizeSelectedComponents(): Promise<AudioBuffer | null> {
  try {
    console.log('=== 位相制御音声合成開始 ===');

    // チェックされた成分を取得（音声パス: includeTestWaves=false、既存の非対称を保存）
    const selectedComponents = collectSelectedComponents(
      readCheckboxStates(),
      frequencyComponents,
      maxAnalysisAmplitude,
      false,
    );

    if (selectedComponents.length === 0) {
      console.warn('合成用の成分が選択されていません');
      showStatusMessage('周波数成分を選択してから合成再生ボタンを押してください', 'error');
      return null;
    }

    console.log(`=== ${selectedComponents.length}個の成分で音声合成を実行 ===`);

    // 元録音と同じ長さのバッファを作成
    const duration = 2; // 元録音と同じ2秒
    const sampleRate = state.audioContext!.sampleRate;
    const length = Math.floor(duration * sampleRate);
    const buffer = state.audioContext!.createBuffer(1, length, sampleRate);

    console.log(`合成音声バッファ作成: ${duration}秒, ${sampleRate}Hz, ${length}サンプル`);

    // 音声パス（audio/synthesis.ts, M2-10）: 加算合成 + 適応的正規化
    const samples = synthesizeAudioSamples(
      selectedComponents,
      sampleRate,
      duration,
      maxAnalysisAmplitude,
    );
    buffer.getChannelData(0).set(samples);

    let finalMax = 0;
    let finalRMS = 0;
    for (let i = 0; i < samples.length; i++) {
      const sample = Math.abs(samples[i]);
      if (sample > finalMax) finalMax = sample;
      finalRMS += samples[i] * samples[i];
    }
    finalRMS = Math.sqrt(finalRMS / samples.length);
    console.log(`最終波形の最大振幅: ${finalMax.toFixed(6)}`);
    console.log(`最終波形のRMS: ${finalRMS.toFixed(6)}`);

    synthesizedBuffer = buffer;
    console.log('=== 位相制御音声合成完了 ===');

    // 成功メッセージ
    showStatusMessage(
      `${selectedComponents.length}個の成分で位相制御音声合成が完了しました。再生します...`,
    );

    return buffer;
  } catch (error) {
    console.error('位相制御音声合成でエラー:', error);
    showStatusMessage('音声合成中にエラーが発生しました: ' + (error as Error).message, 'error');
    return null;
  }
}

// 合成音声を再生
async function playSynthesizedAudio(): Promise<void> {
  try {
    if (!synthesizedBuffer) {
      console.warn('合成音声バッファがありません');
      showStatusMessage('先に「合成再生」ボタンを押してください', 'error');
      return;
    }

    console.log('=== 合成音声の再生開始 ===');
    console.log(
      `バッファ情報: ${synthesizedBuffer.duration.toFixed(2)}秒, ${synthesizedBuffer.sampleRate}Hz`,
    );

    const source = state.audioContext!.createBufferSource();
    source.buffer = synthesizedBuffer;
    source.connect(state.audioContext!.destination);

    if (state.audioContext!.state === 'suspended') {
      await state.audioContext!.resume();
      console.log('AudioContext resumed');
    }

    source.start();
    console.log('合成音声の再生を開始しました');

    showStatusMessage('位相制御で合成された音声を再生中...');

    source.onended = () => {
      console.log('合成音声の再生が終了しました');
      showStatusMessage('合成音声の再生が完了しました。「原音との比較」で聞き比べてください。');
    };
  } catch (error) {
    console.error('合成音声再生でエラー:', error);
    showStatusMessage('合成音声の再生でエラーが発生しました: ' + (error as Error).message, 'error');
  }
}

// 選択されたサイン波の合成波形を計算する関数
function calculateSynthesisWaveform(): Float32Array {
  try {
    const sineWavesList = document.getElementById('sine-waves-list');
    if (!sineWavesList) {
      console.warn('sine-waves-listが見つかりません');
      return new Float32Array(0);
    }

    // チェックされた成分を収集（表示パス: includeTestWaves=true、既存の非対称を保存）
    const selectedComponents = collectSelectedComponents(
      readCheckboxStates(),
      frequencyComponents,
      maxAnalysisAmplitude,
      true,
    );

    console.log(`選択された成分数: ${selectedComponents.length}`);

    if (selectedComponents.length === 0) {
      // 選択成分がない場合は空の配列を返す
      return new Float32Array(0);
    }

    // 表示パス（audio/synthesis.ts, M2-10）
    const synthesisData = calculateDisplaySynthesisWaveform(selectedComponents);

    console.log(
      `合成波形計算完了: ${selectedComponents.length}成分, ${synthesisData.length}サンプル（定常状態部分を表示）`,
    );
    return synthesisData;
  } catch (error) {
    console.error('合成波形計算でエラー:', error);
    return new Float32Array(0);
  }
}

// 合成波形専用ビジュアライザークラス
class SynthesisWaveVisualizer {
  canvas: HTMLCanvasElement;
  canvasContainer: HTMLElement;
  canvasContext: CanvasRenderingContext2D;

  constructor() {
    this.canvas = document.getElementById('synthesis-canvas') as HTMLCanvasElement;
    this.canvasContainer = document.getElementById('synthesis-canvas-container')!;
    this.canvasContext = this.canvas.getContext('2d')!;
  }

  // 合成波形を描画
  drawSynthesisWaveform(synthesisData: Float32Array): void {
    console.log(
      `SynthesisWaveVisualizer: 合成波形描画開始 (${synthesisData ? synthesisData.length : 0}サンプル)`,
    );

    // Set background to black
    this.canvasContext.fillStyle = 'rgb(0, 0, 0)';
    this.canvasContext.fillRect(0, 0, this.canvas.width, this.canvas.height);

    if (!synthesisData || synthesisData.length === 0) {
      // 合成データがない場合は中央線のみ表示
      this.canvasContext.strokeStyle = 'rgb(100, 100, 100)';
      this.canvasContext.lineWidth = 1;
      this.canvasContext.beginPath();
      this.canvasContext.moveTo(0, this.canvas.height / 2);
      this.canvasContext.lineTo(this.canvas.width, this.canvas.height / 2);
      this.canvasContext.stroke();

      // コンテナを非表示にする
      this.canvasContainer.style.display = 'none';
      console.log('SynthesisWaveVisualizer: 合成データなし、キャンバス非表示');
      return;
    }

    // コンテナを表示
    this.canvasContainer.style.display = 'block';

    this.canvasContext.lineWidth = 2;
    this.canvasContext.strokeStyle = 'rgb(255, 100, 100)'; // 赤色で合成波形を表示

    this.canvasContext.beginPath();

    const sliceWidth = (this.canvas.width * 1.0) / synthesisData.length;
    let x = 0;

    for (let i = 0; i < synthesisData.length; i++) {
      const v = (synthesisData[i] + 1) / 2; // -1~1 を 0~1 に正規化
      const y = v * this.canvas.height;

      if (i === 0) {
        this.canvasContext.moveTo(x, y);
      } else {
        this.canvasContext.lineTo(x, y);
      }

      x += sliceWidth;
    }

    this.canvasContext.stroke();
    console.log('SynthesisWaveVisualizer: 合成波形描画完了');
  }
}

// 合成波形ビジュアライザーのインスタンス
let synthesisVisualizer: SynthesisWaveVisualizer | null = null;

// 合成波形表示を更新する関数
function updateSynthesisWaveform(): void {
  try {
    // 初回のみインスタンス作成
    if (!synthesisVisualizer) {
      synthesisVisualizer = new SynthesisWaveVisualizer();
    }

    const synthesisData = calculateSynthesisWaveform();
    console.log(`合成波形更新: ${synthesisData.length}サンプル`);

    synthesisVisualizer.drawSynthesisWaveform(synthesisData);
  } catch (error) {
    console.error('合成波形更新でエラー:', error);
  }
}

// サイン波のチェックボックスをハンドルする関数
async function handleSineWaveCheckbox(
  event: Event,
  frequency: number,
  amplitude: number,
  rawAmplitude: number,
  phase = 0,
): Promise<void> {
  const target = event.target as CheckboxWithPlayer;
  console.log(
    `Checkbox ${target.checked ? 'checked' : 'unchecked'} for ${frequency.toFixed(2)} Hz`,
  );

  // 合成波形を更新（音の再生とは独立して実行）
  setTimeout(() => {
    updateSynthesisWaveform();
  }, 10);

  try {
    if (target.checked) {
      const sineWavePlayer = await playSineWave(frequency, amplitude, rawAmplitude, phase);
      if (sineWavePlayer) {
        target.sineWavePlayer = sineWavePlayer;
        console.log(
          `Started sine wave: ${frequency.toFixed(2)} Hz, phase: ${phase.toFixed(3)} rad`,
        );
      } else {
        console.error('Failed to create sine wave player');
        // チェックボックスの状態は維持（波形表示のため）
      }
    } else {
      if (target.sineWavePlayer) {
        target.sineWavePlayer.stop();
        target.sineWavePlayer = null;
        console.log(`Stopped sine wave: ${frequency.toFixed(2)} Hz`);
      }
    }
  } catch (error) {
    console.error('Error handling sine wave checkbox:', error);
    // 音の再生に失敗してもチェックボックスの状態は維持（波形表示のため）
  }
}

// 位相情報付きサイン波リストを表示する関数
function displaySineWaves(sineWaves: FrequencyComponent[]): void {
  const sineWavesList = document.getElementById('sine-waves-list')!;
  sineWavesList.innerHTML = '';

  // 音声再現実験の説明を追加
  const explanationItem = document.createElement('li');
  explanationItem.innerHTML = `
		<div style="background-color: #e7f3ff; padding: 10px; border-radius: 5px; margin-bottom: 10px;">
			<strong>位相情報付き音声再現実験:</strong>
			各周波数成分の音量と位相が元音声と同じに設定されています。
			「合成再生」ボタンで選択した成分を位相制御で合成再生できます。
		</div>
	`;
  sineWavesList.appendChild(explanationItem);

  // 合成再生ボタンを追加
  const synthesisControlItem = document.createElement('li');
  synthesisControlItem.innerHTML = `
		<div style="background-color: #f0f8f0; padding: 15px; border-radius: 5px; margin-bottom: 15px; border: 2px solid #4CAF50;">
			<div style="margin-bottom: 10px;">
				<strong style="color: #2c5530;">🎵 位相制御音声合成</strong>
			</div>
			<div style="margin-bottom: 10px;">
				<button id="auto-select-btn" style="background-color: #FF9800; color: white; border: none; padding: 10px 20px; margin-right: 10px; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 14px;">
					✅ 全てを選択
				</button>
				<button id="auto-deselect-btn" style="background-color: #F44336; color: white; border: none; padding: 10px 20px; margin-right: 10px; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 14px;">
					❌ 全てを解除
				</button>
				<button id="synthesize-btn" style="background-color: #4CAF50; color: white; border: none; padding: 10px 20px; margin-right: 10px; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 14px;">
					🔊 合成再生
				</button>
				<button id="compare-btn" style="background-color: #2196F3; color: white; border: none; padding: 10px 20px; margin-right: 10px; border-radius: 4px; cursor: pointer; font-size: 14px;" disabled>
					⚖️ 原音との比較
				</button>
			</div>
			<div style="font-size: 12px; color: #555; line-height: 1.4;">
				<strong>音声合成の使い方:</strong><br>
				• 「全てを選択」で表示されている上位100成分を一括選択<br>
				• 「全てを解除」で選択を一括解除（再生中の音も停止）<br>
				• 個別に成分を選択・解除して音質を調整できます
			</div>
		</div>
	`;
  sineWavesList.appendChild(synthesisControlItem);

  // 全て選択機能
  document.getElementById('auto-select-btn')!.addEventListener('click', () => {
    try {
      console.log('=== 全成分選択開始 ===');

      if (frequencyComponents.length === 0) {
        showStatusMessage('解析データがありません。先に周波解析ボタンを押してください。', 'error');
        return;
      }

      // 全てのチェックボックスを選択
      const checkboxes = sineWavesList.getElementsByTagName('input');

      for (const checkbox of checkboxes) {
        if (checkbox.id.startsWith('sine-wave-')) {
          if (!checkbox.checked) {
            checkbox.checked = true;
            // changeイベントは発火させない（音が同時に鳴るのを避ける）
          }
        }
      }

      console.log(`全${frequencyComponents.length}個の成分を選択しました`);

      // 合成波形を更新
      setTimeout(() => {
        updateSynthesisWaveform();
      }, 50); // 少し遅延させてチェックボックスの状態更新を確実にする

      showStatusMessage(
        `解析された全${frequencyComponents.length}個の成分を選択しました。「合成再生」を押してください。`,
      );
    } catch (error) {
      console.error('全選択でエラー:', error);
      showStatusMessage('全選択でエラーが発生しました: ' + (error as Error).message, 'error');
    }
  });

  // 全て解除機能
  document.getElementById('auto-deselect-btn')!.addEventListener('click', () => {
    try {
      console.log('=== 全成分解除開始 ===');

      // 全てのチェックボックスを解除
      const checkboxes = sineWavesList.getElementsByTagName('input');
      let deselectedCount = 0;

      for (const checkbox of checkboxes) {
        if (checkbox.id.startsWith('sine-wave-') || checkbox.id.startsWith('test-wave-')) {
          if (checkbox.checked) {
            checkbox.checked = false;
            // changeイベントを発火させて対応するサイン波を停止
            checkbox.dispatchEvent(new Event('change'));
            deselectedCount++;
          }
        }
      }

      console.log(`${deselectedCount}個の成分を解除し、対応するサイン波を停止しました`);

      // 合成波形を更新（全解除なので空の波形になる）
      setTimeout(() => {
        updateSynthesisWaveform();
      }, 50);

      if (deselectedCount > 0) {
        showStatusMessage(`${deselectedCount}個の成分を解除し、再生中のサイン波を停止しました。`);
      } else {
        showStatusMessage('解除する成分がありませんでした。');
      }
    } catch (error) {
      console.error('全解除でエラー:', error);
      showStatusMessage('全解除でエラーが発生しました: ' + (error as Error).message, 'error');
    }
  });

  // イベントリスナーを追加
  document.getElementById('synthesize-btn')!.addEventListener('click', async () => {
    const synthesizeBtn = document.getElementById('synthesize-btn')! as HTMLButtonElement;
    const originalText = synthesizeBtn.textContent;

    // ボタンを無効化してフィードバック
    synthesizeBtn.disabled = true;
    synthesizeBtn.textContent = '🔄 合成中...';
    synthesizeBtn.style.backgroundColor = '#FFA500';

    try {
      const buffer = await synthesizeSelectedComponents();
      if (buffer) {
        await playSynthesizedAudio();
        (document.getElementById('compare-btn') as HTMLButtonElement).disabled = false;
      }
    } catch (error) {
      console.error('合成再生でエラー:', error);
      showStatusMessage('合成再生でエラーが発生しました: ' + (error as Error).message, 'error');
    } finally {
      // ボタンを元に戻す
      synthesizeBtn.disabled = false;
      synthesizeBtn.textContent = originalText;
      synthesizeBtn.style.backgroundColor = '#4CAF50';
    }
  });

  document.getElementById('compare-btn')!.addEventListener('click', async () => {
    // 原音再生（比較用）
    if (state.recordedChunks && state.recordedChunks.length > 0) {
      try {
        const buffer = await state.audioContext!.decodeAudioData(
          await state.recordedChunks[0].arrayBuffer(),
        );
        const source = state.audioContext!.createBufferSource();
        source.buffer = buffer;
        source.connect(state.audioContext!.destination);
        source.start();

        showStatusMessage('🎤 原音を再生中（合成音と比較してください）');

        source.onended = () => {
          showStatusMessage('原音の再生が完了しました。違いを確認できましたか？');
        };
      } catch (error) {
        console.error('原音再生でエラー:', error);
        showStatusMessage('原音の再生でエラーが発生しました', 'error');
      }
    } else {
      showStatusMessage('原音データがありません。録音を行ってください。', 'error');
    }
  });

  if (sineWaves.length === 0) {
    const noDataItem = document.createElement('li');
    noDataItem.innerHTML = `
			<div>解析できる周波数成分が見つかりませんでした。</div>
			<div style="margin-top: 10px;">
				<strong>テスト用の固定周波数:</strong>
			</div>
		`;

    // テスト用の固定周波数を追加
    const testFrequencies = [
      { freq: 440, amp: maxAnalysisAmplitude || 0.1, phase: 0 },
      { freq: 880, amp: (maxAnalysisAmplitude || 0.1) * 0.5, phase: Math.PI / 4 },
      { freq: 1320, amp: (maxAnalysisAmplitude || 0.1) * 0.25, phase: Math.PI / 2 },
    ];
    testFrequencies.forEach((item, index) => {
      const testItem = document.createElement('li');
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.id = `test-wave-${index}`;
      checkbox.addEventListener('change', async (event) => {
        await handleSineWaveCheckbox(event, item.freq, -20, item.amp, item.phase);
      });

      const label = document.createElement('label');
      label.htmlFor = `test-wave-${index}`;
      label.textContent = `Test: ${item.freq} Hz - 位相: ${((item.phase * 180) / Math.PI).toFixed(1)}° - 相対音量: ${(item.amp / (maxAnalysisAmplitude || 0.1)).toFixed(2)}`;
      label.style.color = '#666';

      testItem.appendChild(checkbox);
      testItem.appendChild(label);
      sineWavesList.appendChild(testItem);
    });

    return;
  }

  sineWaves.forEach((sineWave, index) => {
    const listItem = document.createElement('li');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = `sine-wave-${index}`;
    checkbox.addEventListener('change', async (event) => {
      await handleSineWaveCheckbox(
        event,
        sineWave.frequency,
        sineWave.amplitude,
        sineWave.rawAmplitude,
        sineWave.phase,
      );
    });

    const label = document.createElement('label');
    label.htmlFor = `sine-wave-${index}`;

    // 順位表示、相対音量、位相情報を追加
    const rank = index + 1;
    const rankDisplay = rank <= 10 ? `★${rank}` : `${rank}`;
    const relativeVolume =
      maxAnalysisAmplitude > 0 ? sineWave.rawAmplitude / maxAnalysisAmplitude : 0;
    const phaseDegrees = ((sineWave.phase * 180) / Math.PI).toFixed(1);

    label.textContent = `${rankDisplay}. ${sineWave.frequency.toFixed(1)} Hz - 音量: ${relativeVolume.toFixed(3)} (${(relativeVolume * 100).toFixed(1)}%) - 位相: ${phaseDegrees}°`;

    // 上位成分を強調表示
    if (rank <= 10) {
      label.style.fontWeight = 'bold';
      label.style.color = '#2c5530';
    }

    // 相対音量に応じた視覚的強調
    if (relativeVolume > 0.5) {
      label.style.backgroundColor = '#e8f5e8';
    } else if (relativeVolume > 0.1) {
      label.style.backgroundColor = '#f0f8f0';
    }

    listItem.appendChild(checkbox);
    listItem.appendChild(label);
    sineWavesList.appendChild(listItem);
  });

  console.log(`Displayed ${sineWaves.length} sine wave components with phase information`);
}

// 位相情報保持FFT解析
async function analyseRecording(): Promise<number> {
  try {
    console.log('Starting phase-preserving audio analysis...');

    if (!state.recordedChunks || state.recordedChunks.length === 0) {
      throw new Error('No recorded audio data available');
    }

    // 録音データをAudioBufferにデコード
    const buffer = await state.audioContext!.decodeAudioData(
      await state.recordedChunks[0].arrayBuffer(),
    );

    console.log('Buffer info:', {
      duration: buffer.duration,
      sampleRate: buffer.sampleRate,
      numberOfChannels: buffer.numberOfChannels,
      length: buffer.length,
    });

    const channelData = buffer.getChannelData(0);
    const fftSize = 16384;

    // 位相情報保持FFT解析（dsp.ts, M2-7 の golden-vector で保護された純粋関数）
    const result = analyseFrequencyComponents(channelData, state.audioContext!.sampleRate, fftSize);
    maxAnalysisAmplitude = result.maxAmplitude;
    frequencyComponents = result.components;

    displaySineWaves(frequencyComponents);

    console.log(
      `Phase-preserving analysis complete. Displaying ${frequencyComponents.length} components`,
    );
    console.log(`Reference amplitude: ${maxAnalysisAmplitude.toExponential(3)}`);

    return frequencyComponents.length;
  } catch (error) {
    console.error('Error during phase-preserving audio analysis:', error);
    throw error;
  }
}

// ロード時副作用の init() 集約（M2-9）。main.ts の init() から明示的に呼ばれる。
export function initSinewaveAnalyser(): void {
  const analyseBtn = document.getElementById('analyse-btn') as HTMLButtonElement;
  const sineWaveBtn = document.getElementById('sine-wave-btn') as HTMLButtonElement;

  analyseBtn.addEventListener('click', async () => {
    try {
      showStatusMessage('位相情報保持で音声解析を開始しています...');

      const componentCount = await analyseRecording();
      document.getElementById('sine-waves')!.style.display = 'block';
      analyseBtn.disabled = true;
      sineWaveBtn.disabled = false;
      sineWaveBtn.style.fontWeight = 'bold';

      if (componentCount > 0) {
        showStatusMessage(`解析完了！${componentCount}個の成分で位相情報付き音声再現が可能です。`);
      } else {
        showStatusMessage('解析完了。テスト用の固定周波数を使用できます。');
      }
    } catch (error) {
      console.error('Error in analyse button handler:', error);
      showStatusMessage('解析中にエラーが発生しました: ' + (error as Error).message, 'error');
    }
  });

  sineWaveBtn.addEventListener('click', () => {
    try {
      const sineWavesList = document.getElementById('sine-waves-list')!;
      const checkboxes = sineWavesList.getElementsByTagName('input');

      let stoppedCount = 0;
      for (const checkbox of checkboxes) {
        if (checkbox.checked) {
          checkbox.checked = false;
          checkbox.dispatchEvent(new Event('change'));
          stoppedCount++;
        }
      }
      console.log(`Stopped ${stoppedCount} sine waves`);

      showStatusMessage(`${stoppedCount}個の正弦波を停止しました`);
    } catch (error) {
      console.error('Error stopping sine waves:', error);
    }
  });
}
