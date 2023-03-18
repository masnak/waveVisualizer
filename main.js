
let audioContext;
let audioContextInitialized = false;
let micSoundAnalyser;
let waveVisualizer;
let spectrumVisualizer;

const initBtn = document.getElementById('init-btn');
const startBtn = document.getElementById('start-btn');
const playBtn = document.getElementById('play-btn');
const sampleRate = 44100;
const waveformCanvas = document.getElementById('waveform-canvas');
const spectrumCanvas = document.getElementById('spectrum-canvas');


initBtn.addEventListener('click', async () => {
	await initializeAudioAndVisualizer();
	initBtn.disabled = true; // Optional: disable the button after initializing
  });

async function initializeAudioContext() {
  if (audioContextInitialized) return;
  audioContext = new AudioContext();
  audioContextInitialized = true;

  // Initialize micSoundAnalyser, waveVisualizer, and spectrumVisualizer
  micSoundAnalyser = audioContext.createAnalyser();
  waveVisualizer = new WaveVisualizer(micSoundAnalyser, waveformCanvas);
  spectrumVisualizer = new SpectrumVisualizer(micSoundAnalyser, spectrumCanvas, audioContext);
}

async function initializeAudioAndVisualizer() {
	await initializeAudioContext();
  
	const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  
	// connect data stream to micSoundAnalyser
	const source = audioContext.createMediaStreamSource(stream);
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
	const buffer = await audioContext.decodeAudioData(await recordedChunks[0].arrayBuffer());
	const source = audioContext.createBufferSource();
	source.buffer = buffer;
	source.connect(audioContext.destination);

	// Connect the source to the visualizers
	const sourceAnalyser = audioContext.createAnalyser();
	source.connect(sourceAnalyser);
	waveVisualizer.analyser = sourceAnalyser;
	spectrumVisualizer.analyser = sourceAnalyser;

	source.start();
	source.onended = () => {
		console.log('playback finished')
		// Disconnect the visualizers when the audio stops playing
		source.disconnect(sourceAnalyser);
		waveVisualizer.analyser = micSoundAnalyser;
		spectrumVisualizer.analyser = micSoundAnalyser;
		
	};
}

startBtn.addEventListener('click', async () => {
	if (!mediaRecorder || mediaRecorder.state === 'inactive') {
		const stream = await getMediaStream();
		startRecording(stream);
		startBtn.textContent = 'Now Recording...';
		console.log('recorder started');

		setTimeout(() => {
			stopRecording();
			startBtn.textContent = 'Record';
			playBtn.disabled = false;
			playBtn.style.fontWeight = 'bold';
			//playBtn.style.color = 'blue';
		}, 3000);
	}
});

playBtn.addEventListener('click', async () => {
	if (recordedChunks.length) {
		await playBack();
	}
});


