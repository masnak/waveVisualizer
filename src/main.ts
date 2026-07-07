// main.js から born-ESM へそのまま複製（M2-8、最後の変換ファイル）。
// state.ts / ui/status.ts / visualizers を正式に import へ切替え、window ブリッジを除去。
import { state } from './state.js';
import { showStatusMessage } from './ui/status.js';
import { WaveVisualizer } from './visualizers/waveVisualizer.js';
import { SpectrumVisualizer } from './visualizers/spectrumVisualizer.js';
import './sinewaveAnalyser.js'; // イベントリスナー登録の副作用のみが目的

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

initBtn.addEventListener('click', async () => {
  try {
    await initializeAudioAndVisualizer();
    initBtn.disabled = true;
    showStatusMessage('オーディオシステムが正常に初期化されました');
  } catch (error) {
    console.error('Initialization error:', error);
    showStatusMessage('初期化中にエラーが発生しました: ' + (error as Error).message, 'error');
  }
});

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
  await new Promise<void>((resolve) => {
    const checkAudioContextState = () => {
      if (state.audioContext!.state === 'running') {
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

// 未使用（元 main.js から複製、挙動保存のため保持。既知バグとして進捗ログに記録）
void getMediaStream;
void sampleRate;
