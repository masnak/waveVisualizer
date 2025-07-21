
let audioContext;
let audioContextInitialized = false;
let audioStream;
let micSoundAnalyser;
let waveVisualizer;
let spectrumVisualizer;

const initBtn = document.getElementById('init-btn');
const recordBtn = document.getElementById('record-btn');
const playBtn = document.getElementById('play-btn');
const sampleRate = 44100;
const waveformCanvas = document.getElementById('waveform-canvas');
const spectrumCanvas = document.getElementById('spectrum-canvas');

// ステータスメッセージを表示する関数
function showStatusMessage(message, type = 'success') {
	const statusElement = document.getElementById('status-message');
	statusElement.textContent = message;
	statusElement.className = `status-message status-${type}`;
	statusElement.style.display = 'block';
	
	// 3秒後に自動で非表示にする
	setTimeout(() => {
		statusElement.style.display = 'none';
	}, 3000);
}

initBtn.addEventListener('click', async () => {
	try {
		await initializeAudioAndVisualizer();
		initBtn.disabled = true;
		showStatusMessage('オーディオシステムが正常に初期化されました');
	} catch (error) {
		console.error('Initialization error:', error);
		showStatusMessage('初期化中にエラーが発生しました: ' + error.message, 'error');
	}
});

async function initializeAudioContext() {
  if (audioContextInitialized) return;
  audioContext = new AudioContext();
  audioContextInitialized = true;

  // Initialize micSoundAnalyser, waveVisualizer, and spectrumVisualizer
  micSoundAnalyser = audioContext.createAnalyser();
  	micSoundAnalyser.fftSize = 16384;
  waveVisualizer = new WaveVisualizer(micSoundAnalyser, waveformCanvas);
  spectrumVisualizer = new SpectrumVisualizer(micSoundAnalyser, spectrumCanvas, audioContext);
}

async function initializeAudioAndVisualizer() {
	await initializeAudioContext();
  
	audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  
	// connect data stream to micSoundAnalyser
	const source = audioContext.createMediaStreamSource(audioStream);
	source.connect(micSoundAnalyser);
  
	// draw waveform
	waveVisualizer.drawWaveform();
	console.log('wave analyser working');
  
	// Wait for audioContext to initialize
	await new Promise(resolve => {
	  const checkAudioContextState = () => {
		if (audioContext.state === 'running') {
		  resolve();
		} else {
		  setTimeout(checkAudioContextState, 100);
		}
	  };
	  checkAudioContextState();
	});
  
	spectrumVisualizer.drawSpectrum();
	console.log('spectrum analyser working');
}

let mediaRecorder;
let recordedChunks = [];

async function getMediaStream() {
	try {
		const stream = await navigator.mediaDevices.getUserMedia({audio: true});
		return stream;
	} catch (err) {
		console.error('Error accessing user media:', err);
		throw err;
	}
}

function startRecording(stream) {
	recordedChunks = [];
	mediaRecorder = new MediaRecorder(stream);
	mediaRecorder.start();

	mediaRecorder.ondataavailable = (event) => {
		if (event.data.size > 0) {
			recordedChunks.push(event.data);
		}
	};
}

function stopRecording() {
	mediaRecorder.stop();
	console.log('recorder stopped');
}

async function playBack() {
	try {
		const buffer = await audioContext.decodeAudioData(await recordedChunks[0].arrayBuffer());
		const source = audioContext.createBufferSource();
		source.buffer = buffer;
		source.connect(audioContext.destination);

		// Connect the source to the visualizers
		const sourceAnalyser = audioContext.createAnalyser();
		sourceAnalyser.fftSize = 16384;
		source.connect(sourceAnalyser);
		waveVisualizer.analyser = sourceAnalyser;
		spectrumVisualizer.analyser = sourceAnalyser;

		source.start();
		showStatusMessage('録音音声を再生中...');
		
		source.onended = () => {
			console.log('playback finished');
			// Disconnect the visualizers when the audio stops playing
			source.disconnect(sourceAnalyser);
			waveVisualizer.analyser = micSoundAnalyser;
			spectrumVisualizer.analyser = micSoundAnalyser;
			showStatusMessage('再生が完了しました');
		};
	} catch (error) {
		console.error('Playback error:', error);
		showStatusMessage('再生中にエラーが発生しました: ' + error.message, 'error');
	}
}

recordBtn.addEventListener('click', async () => {
	try {
		if (!mediaRecorder || mediaRecorder.state === 'inactive') {
			startRecording(audioStream);
			recordBtn.textContent = 'Now Recording...';
			showStatusMessage('録音を開始しました（2秒間）');
			console.log('recorder started');

			setTimeout(() => {
				stopRecording();
				recordBtn.textContent = 'Record';
				playBtn.disabled = false;
				playBtn.style.fontWeight = 'bold';
				document.getElementById('analyse-btn').disabled = false;
				document.getElementById('analyse-btn').style.fontWeight = 'bold';
				showStatusMessage('録音が完了しました');
			}, 2000);
		}
	} catch (error) {
		console.error('Recording error:', error);
		showStatusMessage('録音中にエラーが発生しました: ' + error.message, 'error');
	}
});

playBtn.addEventListener('click', async () => {
	if (recordedChunks.length) {
		await playBack();
	}
});

// Event listeners for analysis functionality are in sinewaveAnalyser.js

