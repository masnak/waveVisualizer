// main.js から born-ESM へそのまま複製（M2-8）。M2-9 でロード時副作用を init() へ
// 集約: main.ts / sinewaveAnalyser.ts 両方のイベントリスナー登録を、DOMContentLoaded
// （readyState ガード付き）で呼ばれる init() 内に移した。
import { state } from './state.js';
import { showStatusMessage } from './ui/status.js';
import { WaveVisualizer } from './visualizers/waveVisualizer.js';
import { SpectrumVisualizer } from './visualizers/spectrumVisualizer.js';
import { initSinewaveAnalyser } from './sinewaveAnalyser.js';

let audioContextInitialized = false;
let audioStream: MediaStream | undefined;
let micSoundAnalyser: AnalyserNode | undefined;
let waveVisualizer: WaveVisualizer | undefined;
let spectrumVisualizer: SpectrumVisualizer | undefined;

const initBtn = document.getElementById('init-btn') as HTMLButtonElement;
const recordBtn = document.getElementById('record-btn') as HTMLButtonElement;
const playBtn = document.getElementById('play-btn') as HTMLButtonElement;
const sampleRate = 44100;
const waveformCanvas = document.getElementById('waveform-canvas') as HTMLCanvasElement;
const spectrumCanvas = document.getElementById('spectrum-canvas') as HTMLCanvasElement;

function init(): void {
  initBtn.addEventListener('click', async () => {
    try {
      await initializeAudioAndVisualizer();
      initBtn.disabled = true;
      // 既知バグ修正（2026-07-08、ユーザー報告）: record-btn は初期化完了前から
      // 常に押せる状態だったため、audioStream 未確定のまま MediaRecorder の
      // 構築に失敗する競合状態があった。初期化完了までは無効化する。
      recordBtn.disabled = false;
      showStatusMessage('オーディオシステムが正常に初期化されました');
    } catch (error) {
      console.error('Initialization error:', error);
      showStatusMessage('初期化中にエラーが発生しました: ' + (error as Error).message, 'error');
    }
  });

  recordBtn.addEventListener('click', async () => {
    try {
      if (!mediaRecorder || mediaRecorder.state === 'inactive') {
        startRecording(audioStream!);
        recordBtn.textContent = '録音中...';
        showStatusMessage('録音を開始しました（2秒間）');
        console.log('recorder started');
        // スペクトラム分析モードを録音中に設定
        if (spectrumVisualizer) {
          spectrumVisualizer.setRecordingMode(true);
        }

        setTimeout(() => {
          stopRecording();
          recordBtn.textContent = '録音開始';
          playBtn.disabled = false;
          playBtn.style.fontWeight = 'bold';
          (document.getElementById('analyse-btn') as HTMLButtonElement).disabled = false;
          (document.getElementById('analyse-btn') as HTMLButtonElement).style.fontWeight = 'bold';
          showStatusMessage('録音が完了しました');
          // スペクトラム分析モードを録音終了に設定
          if (spectrumVisualizer) {
            spectrumVisualizer.setRecordingMode(false);
          }
        }, 2000);
      }
    } catch (error) {
      console.error('Recording error:', error);
      showStatusMessage('録音中にエラーが発生しました: ' + (error as Error).message, 'error');
    }
  });

  playBtn.addEventListener('click', async () => {
    if (state.recordedChunks.length) {
      await playBack();
    }
  });

  // Event listeners for analysis functionality are in sinewaveAnalyser.ts
  initSinewaveAnalyser();
}

async function initializeAudioContext(): Promise<void> {
  if (audioContextInitialized) return;
  state.audioContext = new AudioContext();
  audioContextInitialized = true;

  // AudioContext初期化確認
  console.log(
    `🎵 AudioContext初期化: ${state.audioContext.sampleRate}Hz (ナイキスト: ${state.audioContext.sampleRate / 2}Hz)`,
  );

  // 異常サンプリングレートの検出
  if (state.audioContext.sampleRate === 48000) {
    console.warn(`⚠️ 48kHzサンプリング → 24kHzまで表示`);
  } else if (state.audioContext.sampleRate !== 44100) {
    console.warn(`⚠️ 非標準サンプリングレート: ${state.audioContext.sampleRate}Hz`);
  }

  // Initialize micSoundAnalyser, waveVisualizer, and spectrumVisualizer
  micSoundAnalyser = state.audioContext.createAnalyser();
  micSoundAnalyser.fftSize = 16384;

  // Analyser設定情報の保存（録音時に表示用）
  window.analyserSettings = {
    fftSize: micSoundAnalyser.fftSize,
    frequencyBinCount: micSoundAnalyser.frequencyBinCount,
    minDecibels: micSoundAnalyser.minDecibels,
    maxDecibels: micSoundAnalyser.maxDecibels,
    smoothingTimeConstant: micSoundAnalyser.smoothingTimeConstant,
  };

  waveVisualizer = new WaveVisualizer(micSoundAnalyser, waveformCanvas);
  spectrumVisualizer = new SpectrumVisualizer(micSoundAnalyser, spectrumCanvas, state.audioContext);
}

async function initializeAudioAndVisualizer(): Promise<void> {
  await initializeAudioContext();

  audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });

  // connect data stream to micSoundAnalyser
  const source = state.audioContext!.createMediaStreamSource(audioStream);
  source.connect(micSoundAnalyser!);

  // draw waveform
  waveVisualizer!.drawWaveform();
  console.log('wave analyser working');

  // Wait for audioContext to initialize
  // 計画 0.5 例外①: タイムアウトを追加（timeout 時は現行の続行と等価に resolve、
  // reject にはしない）。無限ポーリングを避けるための防御的な変更で、
  // 通常のフローでは audioContext はほぼ即座に 'running' になるため到達しない。
  const AUDIO_CONTEXT_POLL_TIMEOUT_MS = 5000;
  await new Promise<void>((resolve) => {
    const startedAt = Date.now();
    const checkAudioContextState = () => {
      if (
        state.audioContext!.state === 'running' ||
        Date.now() - startedAt >= AUDIO_CONTEXT_POLL_TIMEOUT_MS
      ) {
        resolve();
      } else {
        setTimeout(checkAudioContextState, 100);
      }
    };
    checkAudioContextState();
  });

  spectrumVisualizer!.drawSpectrum();
  console.log('spectrum analyser working');
}

let mediaRecorder: MediaRecorder | undefined;

async function getMediaStream(): Promise<MediaStream> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    return stream;
  } catch (err) {
    console.error('Error accessing user media:', err);
    throw err;
  }
}

function startRecording(stream: MediaStream): void {
  state.recordedChunks = [];
  mediaRecorder = new MediaRecorder(stream);
  mediaRecorder.start();

  mediaRecorder.ondataavailable = (event) => {
    if (event.data.size > 0) {
      state.recordedChunks.push(event.data);
    }
  };
}

function stopRecording(): void {
  mediaRecorder!.stop();
  console.log('recorder stopped');
  // スペクトラム分析モードを録音終了に設定
  if (spectrumVisualizer) {
    spectrumVisualizer.setRecordingMode(false);
  }
}

async function playBack(): Promise<void> {
  try {
    const buffer = await state.audioContext!.decodeAudioData(
      await state.recordedChunks[0].arrayBuffer(),
    );
    const source = state.audioContext!.createBufferSource();
    source.buffer = buffer;
    source.connect(state.audioContext!.destination);

    // Connect the source to the visualizers
    const sourceAnalyser = state.audioContext!.createAnalyser();
    sourceAnalyser.fftSize = 16384;
    source.connect(sourceAnalyser);
    waveVisualizer!.analyser = sourceAnalyser;
    spectrumVisualizer!.analyser = sourceAnalyser;

    source.start();
    showStatusMessage('録音音声を再生中...');

    source.onended = () => {
      console.log('playback finished');
      // Disconnect the visualizers when the audio stops playing
      source.disconnect(sourceAnalyser);
      waveVisualizer!.analyser = micSoundAnalyser!;
      spectrumVisualizer!.analyser = micSoundAnalyser!;
      showStatusMessage('再生が完了しました');
    };
  } catch (error) {
    console.error('Playback error:', error);
    showStatusMessage('再生中にエラーが発生しました: ' + (error as Error).message, 'error');
  }
}

// 未使用（元 main.js から複製、挙動保存のため保持。既知バグとして進捗ログに記録）
void getMediaStream;
void sampleRate;

// ロード時副作用の起動（M2-9）。ES module は defer 相当で実行されるため、
// 通常 readyState は既に 'loading' 以外だが、念のためガードする。
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
