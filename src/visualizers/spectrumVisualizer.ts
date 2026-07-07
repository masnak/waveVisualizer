// spectrumVisualizer.js から born-ESM へそのまま複製（M2-8）。挙動は完全に維持
// （診断ログの量的維持は非保証、計画 1.3 Q4）。
// window.analyserSettings は main.ts が書き込む値をそのまま読む（実質定数的な
// 設定値のスナップショットで、頻繁な再代入を伴わないため state.ts には含めない）。
interface AnalyserSettings {
  fftSize: number;
  frequencyBinCount: number;
  minDecibels: number;
  maxDecibels: number;
  smoothingTimeConstant: number;
}

declare global {
  interface Window {
    analyserSettings?: AnalyserSettings;
  }
}

export class SpectrumVisualizer {
  analyser: AnalyserNode;
  canvas: HTMLCanvasElement;
  audioContext: AudioContext;
  canvasContext: CanvasRenderingContext2D;
  bufferLength: number;
  dataArray: Uint8Array<ArrayBuffer>;

  debugLogged = false;
  labelDebugLogged = false;
  labelPositionsLogged = false;
  barDebugLogged = false;
  highFreqLogged = false;

  isRecording = false;
  recordingDebugData: {
    mappingLogged: boolean;
    fftDataLogged: boolean;
    voiceLogged: boolean;
    analyserSettingsLogged: boolean;
  } = {
    mappingLogged: false,
    fftDataLogged: false,
    voiceLogged: false,
    analyserSettingsLogged: false,
  };

  constructor(analyser: AnalyserNode, canvas: HTMLCanvasElement, audioContext: AudioContext) {
    this.analyser = analyser;
    this.canvas = canvas;
    this.audioContext = audioContext;
    this.canvasContext = this.canvas.getContext('2d')!;
    this.bufferLength = this.analyser.frequencyBinCount;
    this.dataArray = new Uint8Array(this.bufferLength);

    console.log(`=== SpectrumVisualizer 初期化 ===`);
    console.log(`analyser.fftSize: ${this.analyser.fftSize}`);
    console.log(`analyser.frequencyBinCount: ${this.bufferLength}`);
    console.log(`audioContext.sampleRate: ${this.audioContext.sampleRate}`);

    console.log(
      `✅ SpectrumVisualizer初期化完了 (SR:${this.audioContext.sampleRate}Hz, Nyquist:${this.audioContext.sampleRate / 2}Hz)`,
    );
  }

  setRecordingMode(isRecording: boolean): void {
    this.isRecording = isRecording;
    if (isRecording) {
      console.log(`🎤 録音開始 - 詳細分析開始`);

      if (window.analyserSettings) {
        console.log(`🔧 Analyser設定:`);
        console.log(`  - fftSize: ${window.analyserSettings.fftSize}`);
        console.log(`  - frequencyBinCount: ${window.analyserSettings.frequencyBinCount}`);
        console.log(`  - minDecibels: ${window.analyserSettings.minDecibels}dB`);
        console.log(`  - maxDecibels: ${window.analyserSettings.maxDecibels}dB`);
        console.log(`  - smoothingTimeConstant: ${window.analyserSettings.smoothingTimeConstant}`);
      }

      this.recordingDebugData = {
        mappingLogged: false,
        fftDataLogged: false,
        voiceLogged: false,
        analyserSettingsLogged: false,
      };
    } else {
      console.log(`⏹️ 録音終了 - 詳細分析終了`);
    }
  }

  drawSpectrum(): void {
    this.analyser.getByteFrequencyData(this.dataArray);

    if (this.isRecording && !this.recordingDebugData.fftDataLogged) {
      const maxValue = Math.max(...this.dataArray);
      const minValue = Math.min(...this.dataArray);
      const avgValue = this.dataArray.reduce((a, b) => a + b) / this.dataArray.length;
      console.log(
        `📈 FFTデータ統計: 最大=${maxValue}, 最小=${minValue}, 平均=${avgValue.toFixed(1)}`,
      );

      const highFreqStart = Math.floor(this.bufferLength * 0.8);
      const highFreqData = this.dataArray.slice(highFreqStart);
      const highFreqMax = Math.max(...highFreqData);
      console.log(`📈 高周波域(80-100%): 最大振幅=${highFreqMax}`);
      this.recordingDebugData.fftDataLogged = true;
    }

    if (!this.debugLogged) {
      const nyquist = this.audioContext.sampleRate / 2;
      const freqResolution = nyquist / this.bufferLength;
      console.log(
        `📊 スペクトラム設定: FFT=${this.analyser.fftSize}, ビン数=${this.bufferLength}, 分解能=${freqResolution.toFixed(1)}Hz/ビン`,
      );
      console.log(`📐 表示範囲: 0 - ${nyquist}Hz (ナイキスト周波数)`);

      if (this.audioContext.sampleRate === 48000) {
        console.warn(`⚠️ 48kHzサンプリング検出 → ナイキスト24kHz`);
      } else if (this.audioContext.sampleRate !== 44100) {
        console.warn(`⚠️ 非標準サンプリングレート: ${this.audioContext.sampleRate}Hz`);
      }

      this.debugLogged = true;
    }

    // Set background to black
    this.canvasContext.fillStyle = 'rgb(0, 0, 0)';
    this.canvasContext.fillRect(0, 0, this.canvas.width, this.canvas.height);

    const barWidth = (this.canvas.width / this.bufferLength) * 2.5;
    let barHeight: number;
    let x = 0;

    if (!this.barDebugLogged) {
      const maxFreq =
        ((this.bufferLength - 1) * this.audioContext.sampleRate) / 2 / this.bufferLength;
      console.log(
        `🎨 バー設定: ${this.bufferLength}本, 幅${barWidth.toFixed(1)}px, 最大周波数${maxFreq.toFixed(0)}Hz`,
      );
      this.barDebugLogged = true;
    }

    for (let i = 0; i < this.bufferLength; i++) {
      barHeight = this.dataArray[i];

      const frequency = (i * this.audioContext.sampleRate) / 2 / this.bufferLength;

      if (this.isRecording && !this.recordingDebugData.mappingLogged) {
        if (i < 10) {
          console.log(
            `📊 低周波ビン${i}: ${frequency.toFixed(1)}Hz, X=${x.toFixed(0)}px, 振幅=${barHeight}`,
          );
        } else if (i > this.bufferLength * 0.9 && i % 100 === 0) {
          console.log(
            `📊 高周波ビン${i}: ${frequency.toFixed(0)}Hz, X=${x.toFixed(0)}px, 振幅=${barHeight}`,
          );
        }
        if (i === this.bufferLength - 1) {
          console.log(`🔚 最後のバー: ビン${i} = ${frequency.toFixed(0)}Hz, X=${x.toFixed(0)}px`);
          this.recordingDebugData.mappingLogged = true;
        }
      }

      if (this.isRecording) {
        if (barHeight > 50) {
          console.warn(
            `🔴 高振幅検出: ビン${i}, ${frequency.toFixed(0)}Hz, 振幅${barHeight}, X=${x.toFixed(0)}px`,
          );
        }

        if (frequency > 20000 && barHeight > 1) {
          console.error(
            `🚨 20kHz超: ビン${i}, ${frequency.toFixed(0)}Hz, 振幅${barHeight}, X=${x.toFixed(0)}px`,
          );
        }

        if (frequency <= 8000 && barHeight > 30 && !this.recordingDebugData.voiceLogged) {
          console.info(`🎤 音声域高振幅: ${frequency.toFixed(0)}Hz, 振幅${barHeight}`);
          this.recordingDebugData.voiceLogged = true;
        }
      }

      // Set bar color to bright green
      this.canvasContext.fillStyle = 'rgb(0, 255, 0)';
      this.canvasContext.fillRect(x, this.canvas.height - barHeight / 2, barWidth, barHeight / 2);

      x += barWidth + 1;
    }

    this.drawGrid();

    requestAnimationFrame(() => this.drawSpectrum());
  }

  drawGrid(): void {
    const gridFrequencyInterval = 500;
    const gridLineWidth = 1;
    const gridColor = 'rgba(128, 128, 0, 0.5)'; // Dark yellow
    const nyquist = this.audioContext.sampleRate / 2;
    const pixelsPerHz = this.canvas.width / nyquist;

    const drawGridLine = (freq: number, color: string) => {
      const xPos = freq * pixelsPerHz;
      this.canvasContext.beginPath();
      this.canvasContext.moveTo(xPos, 0);
      this.canvasContext.lineTo(xPos, this.canvas.height);
      this.canvasContext.lineWidth = gridLineWidth;
      this.canvasContext.strokeStyle = color;
      this.canvasContext.stroke();
    };

    for (let freq = gridFrequencyInterval; freq < nyquist; freq += gridFrequencyInterval) {
      const color =
        freq % 5000 === 0
          ? 'rgba(0, 255, 0, 0.8)'
          : freq % 1000 === 0
            ? 'rgba(255, 255, 0, 0.5)'
            : gridColor;
      drawGridLine(freq, color);
    }

    this.drawLabels();
  }

  drawLabels(): void {
    const ctx = this.canvas.getContext('2d')!;
    ctx.font = '12px Arial';
    ctx.fillStyle = 'white';
    ctx.textAlign = 'center';

    const labelInterval = 5000;
    const nyquist = this.audioContext.sampleRate / 2;
    const maxValue = Math.floor(nyquist);
    const pxPerHz = (this.canvas.width - 20) / nyquist;

    if (!this.labelDebugLogged) {
      console.log(`🏷️ ラベル設定: ${labelInterval}Hz間隔, 最大${maxValue}Hz`);

      if (maxValue >= 25000) {
        console.warn(`⚠️ 25kHz超のラベル範囲: ${maxValue}Hz`);
      }

      this.labelDebugLogged = true;
    }

    for (let i = labelInterval; i < maxValue; i += labelInterval) {
      const xPos = 10 + i * pxPerHz;
      const label = (i / 1000).toFixed(0) + 'k';

      if (!this.labelPositionsLogged && i === 20000) {
        console.log(`📍 20kHzラベル位置: X=${xPos.toFixed(0)}px`);
        this.labelPositionsLogged = true;
      }

      ctx.fillText(label, xPos, this.canvas.height - 5);
    }
  }
}
