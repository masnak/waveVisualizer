// waveVisualizer.js

class WaveVisualizer {
    constructor(analyser, canvas) {
        this.analyser = analyser;
        this.canvas = canvas;
        this.canvasContext = this.canvas.getContext('2d');
        this.bufferLength = this.analyser.fftSize;
        this.dataArray = new Uint8Array(this.bufferLength);
    }

    drawWaveform() {
        this.analyser.getByteTimeDomainData(this.dataArray);

        // Set background to black
        this.canvasContext.fillStyle = 'rgb(0, 0, 0)';
        this.canvasContext.fillRect(0, 0, this.canvas.width, this.canvas.height);

        this.canvasContext.lineWidth = 2;

        // Set line color to bright green
        this.canvasContext.strokeStyle = 'rgb(0, 255, 0)';

        this.canvasContext.beginPath();

        const sliceWidth = this.canvas.width * 1.0 / this.bufferLength;
        let x = 0;

        for (let i = 0; i < this.bufferLength; i++) {
            const v = this.dataArray[i] / 128.0;
            const y = v * this.canvas.height / 2;

            if (i === 0) {
                this.canvasContext.moveTo(x, y);
            } else {
                this.canvasContext.lineTo(x, y);
            }

            x += sliceWidth;
        }

        this.canvasContext.lineTo(this.canvas.width, this.canvas.height / 2);
        this.canvasContext.stroke();

        requestAnimationFrame(() => this.drawWaveform());
    }
	
}

// 以下のように、WaveVisualizer クラスを使用できます。
// インスタンスを作成し、drawWaveform メソッドを呼び出すだけです。

// const waveVisualizer = new WaveVisualizer(analyser, canvas);
// waveVisualizer.drawWaveform();
