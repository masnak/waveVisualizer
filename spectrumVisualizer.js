// spectrumVisualizer.js

class SpectrumVisualizer {
    constructor(analyser, canvas, audioContext) {
        this.analyser = analyser;
        this.canvas = canvas;
        this.audioContext = audioContext;
        this.canvasContext = this.canvas.getContext('2d');
        this.bufferLength = this.analyser.frequencyBinCount;
        this.dataArray = new Uint8Array(this.bufferLength);
        
        // デバッグフラグ
        this.debugLogged = false;
        this.labelDebugLogged = false;
        this.labelPositionsLogged = false;
        this.barDebugLogged = false;
        this.highFreqLogged = false;
        
        // 録音状態管理
        this.isRecording = false;
        this.recordingDebugData = {
            mappingLogged: false,
            fftDataLogged: false,
            voiceLogged: false,
            analyserSettingsLogged: false
        };
        
        console.log(`=== SpectrumVisualizer 初期化 ===`);
        console.log(`analyser.fftSize: ${this.analyser.fftSize}`);
        console.log(`analyser.frequencyBinCount: ${this.bufferLength}`);
        console.log(`audioContext.sampleRate: ${this.audioContext.sampleRate}`);
        
        // 初期化完了の簡潔な確認
        console.log(`✅ SpectrumVisualizer初期化完了 (SR:${this.audioContext.sampleRate}Hz, Nyquist:${this.audioContext.sampleRate/2}Hz)`);
    }
    
    setRecordingMode(isRecording) {
        this.isRecording = isRecording;
        if (isRecording) {
            console.log(`🎤 録音開始 - 詳細分析開始`);
            
            // Analyser設定の表示
            if (window.analyserSettings) {
                console.log(`🔧 Analyser設定:`);
                console.log(`  - fftSize: ${window.analyserSettings.fftSize}`);
                console.log(`  - frequencyBinCount: ${window.analyserSettings.frequencyBinCount}`);
                console.log(`  - minDecibels: ${window.analyserSettings.minDecibels}dB`);
                console.log(`  - maxDecibels: ${window.analyserSettings.maxDecibels}dB`);
                console.log(`  - smoothingTimeConstant: ${window.analyserSettings.smoothingTimeConstant}`);
            }
            
            // 録音開始時にフラグをリセット
            this.recordingDebugData = {
                mappingLogged: false,
                fftDataLogged: false,
                voiceLogged: false,
                analyserSettingsLogged: false
            };
        } else {
            console.log(`⏹️ 録音終了 - 詳細分析終了`);
        }
    }

    drawSpectrum() {
        this.analyser.getByteFrequencyData(this.dataArray);

        // FFTデータの統計情報（録音中のみ、初回のみ）
        if (this.isRecording && !this.recordingDebugData.fftDataLogged) {
            const maxValue = Math.max(...this.dataArray);
            const minValue = Math.min(...this.dataArray);
            const avgValue = this.dataArray.reduce((a, b) => a + b) / this.dataArray.length;
            console.log(`📈 FFTデータ統計: 最大=${maxValue}, 最小=${minValue}, 平均=${avgValue.toFixed(1)}`);
            
            // 高周波域の値も確認
            const highFreqStart = Math.floor(this.bufferLength * 0.8);
            const highFreqData = this.dataArray.slice(highFreqStart);
            const highFreqMax = Math.max(...highFreqData);
            console.log(`📈 高周波域(80-100%): 最大振幅=${highFreqMax}`);
            this.recordingDebugData.fftDataLogged = true;
        }

        // スペクトラム設定情報（初回のみ）
        if (!this.debugLogged) {
            const nyquist = this.audioContext.sampleRate / 2;
            const freqResolution = nyquist / this.bufferLength;
            console.log(`📊 スペクトラム設定: FFT=${this.analyser.fftSize}, ビン数=${this.bufferLength}, 分解能=${freqResolution.toFixed(1)}Hz/ビン`);
            console.log(`📐 表示範囲: 0 - ${nyquist}Hz (ナイキスト周波数)`);
            
            // 異常なサンプリングレートの検出
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
        let barHeight;
        let x = 0;

        // バー描画設定（初回のみ）
        if (!this.barDebugLogged) {
            const maxFreq = ((this.bufferLength - 1) * this.audioContext.sampleRate / 2) / this.bufferLength;
            console.log(`🎨 バー設定: ${this.bufferLength}本, 幅${barWidth.toFixed(1)}px, 最大周波数${maxFreq.toFixed(0)}Hz`);
            this.barDebugLogged = true;
        }

        for (let i = 0; i < this.bufferLength; i++) {
            barHeight = this.dataArray[i];

            // 周波数計算（正確な計算）
            const frequency = (i * this.audioContext.sampleRate / 2) / this.bufferLength;
            
            // 詳細なマッピング検証（録音中のみ、初回のみ）
            if (this.isRecording && !this.recordingDebugData.mappingLogged) {
                if (i < 10) {
                    console.log(`📊 低周波ビン${i}: ${frequency.toFixed(1)}Hz, X=${x.toFixed(0)}px, 振幅=${barHeight}`);
                } else if (i > this.bufferLength * 0.9 && i % 100 === 0) {
                    console.log(`📊 高周波ビン${i}: ${frequency.toFixed(0)}Hz, X=${x.toFixed(0)}px, 振幅=${barHeight}`);
                }
                if (i === this.bufferLength - 1) {
                    console.log(`🔚 最後のバー: ビン${i} = ${frequency.toFixed(0)}Hz, X=${x.toFixed(0)}px`);
                    this.recordingDebugData.mappingLogged = true;
                }
            }
            
            // 録音中のみリアルタイム信号監視
            if (this.isRecording) {
                // 高振幅信号の詳細分析
                if (barHeight > 50) {
                    console.warn(`🔴 高振幅検出: ビン${i}, ${frequency.toFixed(0)}Hz, 振幅${barHeight}, X=${x.toFixed(0)}px`);
                }
                
                // 20kHz以上の信号を全て監視
                if (frequency > 20000 && barHeight > 1) {
                    console.error(`🚨 20kHz超: ビン${i}, ${frequency.toFixed(0)}Hz, 振幅${barHeight}, X=${x.toFixed(0)}px`);
                }
                
                // 音声域（8kHz以下）の高振幅も記録（初回のみ）
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
        const nyquist = this.audioContext.sampleRate / 2;
        const maxValue = Math.floor(nyquist);
        const pxPerHz = (this.canvas.width - 20) / nyquist;

        // ラベル設定確認（初回のみ）
        if (!this.labelDebugLogged) {
            console.log(`🏷️ ラベル設定: ${labelInterval}Hz間隔, 最大${maxValue}Hz`);
            
            // 異常値の簡潔な検出
            if (maxValue >= 25000) {
                console.warn(`⚠️ 25kHz超のラベル範囲: ${maxValue}Hz`);
            }
            
            this.labelDebugLogged = true;
        }

        for (let i = labelInterval; i < maxValue; i += labelInterval) {
            const xPos = 10 + i * pxPerHz;
            const label = (i / 1000).toFixed(0) + 'k';
            
            // 20kHzラベル位置の確認（初回のみ）
            if (!this.labelPositionsLogged && i === 20000) {
                console.log(`📍 20kHzラベル位置: X=${xPos.toFixed(0)}px`);
                this.labelPositionsLogged = true;
            }
            
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

		
