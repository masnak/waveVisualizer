// spectrumVisualizer.js

class SpectrumVisualizer {
    constructor(analyser, canvas, audioContext) {
        this.analyser = analyser;
        this.canvas = canvas;
        this.audioContext = audioContext;
        this.canvasContext = this.canvas.getContext('2d');
        this.bufferLength = this.analyser.frequencyBinCount;
        this.dataArray = new Uint8Array(this.bufferLength);
    }

    drawSpectrum() {
        this.analyser.getByteFrequencyData(this.dataArray);

        // Set background to black
        this.canvasContext.fillStyle = 'rgb(0, 0, 0)';
        this.canvasContext.fillRect(0, 0, this.canvas.width, this.canvas.height);

        const barWidth = (this.canvas.width / this.bufferLength) * 2.5;
        let barHeight;
        let x = 0;

        for (let i = 0; i < this.bufferLength; i++) {
            barHeight = this.dataArray[i];

            // Set bar color to bright green
            this.canvasContext.fillStyle = 'rgb(0, 255, 0)';
            this.canvasContext.fillRect(x, this.canvas.height - barHeight / 2, barWidth, barHeight / 2);

            x += barWidth + 1;
        }

        this.drawGrid();

        requestAnimationFrame(() => this.drawSpectrum());
    }

    drawGrid() {
        const gridFrequencyInterval = 500;
        const gridLineWidth = 1;
        const gridColor = 'rgba(128, 128, 0, 0.5)'; // Dark yellow
        const nyquist = this.audioContext.sampleRate / 2;
        const pixelsPerHz = this.canvas.width / nyquist;

        const drawGridLine = (freq, color) => {
            const xPos = freq * pixelsPerHz;
            this.canvasContext.beginPath();
            this.canvasContext.moveTo(xPos, 0);
            this.canvasContext.lineTo(xPos, this.canvas.height);
            this.canvasContext.lineWidth = gridLineWidth;
            this.canvasContext.strokeStyle = color;
            this.canvasContext.stroke();
        };

        for (let freq = gridFrequencyInterval; freq < nyquist; freq += gridFrequencyInterval) {
            const color = freq % 5000 === 0 ? 'rgba(0, 255, 0, 0.8)' : freq % 1000 === 0 ? 'rgba(255, 255, 0, 0.5)' : gridColor;
            drawGridLine(freq, color);
        }

        this.drawLabels();
    }

    drawLabels() {
        const ctx = this.canvas.getContext('2d');
        ctx.font = '12px Arial';
        ctx.fillStyle = 'white';
        ctx.textAlign = 'center';

        const labelInterval = 5000;
        const maxValue = Math.floor(this.audioContext.sampleRate / 2);
        const pxPerHz = (this.canvas.width - 20) / maxValue;

        for (let i = labelInterval; i < maxValue; i += labelInterval) {
            const xPos = 10 + i * pxPerHz;
            const label = (i / 1000).toFixed(0) + 'k';
            ctx.fillText(label, xPos, this.canvas.height - 5);
		}
		}
		}
		
		// 以下のように、SpectrumVisualizer クラスを使用できます。
		// インスタンスを作成し、drawSpectrum メソッドを呼び出すだけです。
		
		// const spectrumVisualizer = new SpectrumVisualizer(analyser, canvas, audioContext);
		// spectrumVisualizer.drawSpectrum();
		// このクラスにより、`drawSpectrum` およびグリッド表示の機能が 
		// `SpectrumVisualizer` クラスにカプセル化されています。
		// 必要に応じて、このクラスをさらにカスタマイズして、追加の機能を実装できます。

		
