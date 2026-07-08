// waveVisualizer.js から born-ESM へ複製（M2-8）。
// M2-11: rAF ループを start/stop 契約に変更（既知バグ-1「初期化ボタン連打で
// rAF 自己ループが多重化しうる」問題の設計改善としての解消。挙動保存ではなく
// 明示的な設計改善として分類・記録）。start() は running フラグで冪等化し、
// 複数回呼ばれても rAF チェーンは 1 本だけになる。
export class WaveVisualizer {
  analyser: AnalyserNode;
  canvas: HTMLCanvasElement;
  canvasContext: CanvasRenderingContext2D;
  bufferLength: number;
  dataArray: Uint8Array<ArrayBuffer>;
  private rafId: number | null = null;
  private running = false;

  constructor(analyser: AnalyserNode, canvas: HTMLCanvasElement) {
    this.analyser = analyser;
    this.canvas = canvas;
    this.canvasContext = this.canvas.getContext('2d')!;
    this.bufferLength = this.analyser.fftSize;
    this.dataArray = new Uint8Array(this.bufferLength);
  }

  start(): void {
    if (this.running) return; // 多重ループ防止（冪等化）
    this.running = true;
    this.renderLoop();
  }

  stop(): void {
    this.running = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private renderLoop(): void {
    this.drawWaveform();
    if (this.running) {
      this.rafId = requestAnimationFrame(() => this.renderLoop());
    }
  }

  drawWaveform(): void {
    this.analyser.getByteTimeDomainData(this.dataArray);

    // Set background to black
    this.canvasContext.fillStyle = 'rgb(0, 0, 0)';
    this.canvasContext.fillRect(0, 0, this.canvas.width, this.canvas.height);

    this.canvasContext.lineWidth = 2;

    // Set line color to bright green
    this.canvasContext.strokeStyle = 'rgb(0, 255, 0)';

    this.canvasContext.beginPath();

    const sliceWidth = (this.canvas.width * 1.0) / this.bufferLength;
    let x = 0;

    for (let i = 0; i < this.bufferLength; i++) {
      const v = this.dataArray[i] / 128.0;
      const y = (v * this.canvas.height) / 2;

      if (i === 0) {
        this.canvasContext.moveTo(x, y);
      } else {
        this.canvasContext.lineTo(x, y);
      }

      x += sliceWidth;
    }

    this.canvasContext.lineTo(this.canvas.width, this.canvas.height / 2);
    this.canvasContext.stroke();
  }
}
