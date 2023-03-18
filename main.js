
let audioContext;
let audioContextInitialized = false;
let audioStream;
let micSoundAnalyser;
let waveVisualizer;
let spectrumVisualizer;

const initBtn = document.getElementById('init-btn');
const recordBtn = document.getElementById('record-btn');
const playBtn = document.getElementById('play-btn');
const analyseBtn = document.getElementById('analyse-btn');
const sineWaveBtn = document.getElementById('sine-wave-btn');
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

recordBtn.addEventListener('click', async () => {
	if (!mediaRecorder || mediaRecorder.state === 'inactive') {
		startRecording(audioStream);
		recordBtn.textContent = 'Now Recording...';
		console.log('recorder started');

		setTimeout(() => {
			stopRecording();
			recordBtn.textContent = 'Record';
			playBtn.disabled = false;
			playBtn.style.fontWeight = 'bold';
			analyseBtn.disabled = false;
			analyseBtn.style.fontWeight = 'bold';
			//playBtn.style.color = 'blue';
		}, 3000);
	}
});

playBtn.addEventListener('click', async () => {
	if (recordedChunks.length) {
		await playBack();
	}
});


///////////////////////////////////////////////////////////////////////////////////////

// sinwaveAnalyser.js

// サイン波を再生するための関数
	async function playSineWave(frequency, amplitude) {
	const oscillator = audioContext.createOscillator();
	const gainNode = audioContext.createGain();
  
	oscillator.frequency.value = frequency;
  
	// Convert amplitude from decibels to linear gain value
	const gainValue = isFinite(amplitude) ? Math.pow(10, amplitude / 20) : 0;

	gainNode.gain.value = gainValue * 0.1;
  
	oscillator.connect(gainNode);
	gainNode.connect(audioContext.destination);
  
	oscillator.start();
	return { oscillator, stop: () => oscillator.stop() }; // return an object with an oscillator and a stop function
  }
  
  
  // サイン波のチェックボックスをハンドルする関数
  
  async function handleSineWaveCheckbox(event, frequency, amplitudeInDB) {
	if (event.target.checked) {
	  // Convert amplitude from decibels to linear gain value
	  const amplitude = Math.pow(10, amplitudeInDB / 20);
	  const sineWavePlayer = await playSineWave(frequency, amplitude);
	  event.target.sineWavePlayer = sineWavePlayer;
	} else {
	  event.target.sineWavePlayer.stop();
	}
  }
  

  async function analyseRecording() {
	const buffer = await audioContext.decodeAudioData(await recordedChunks[0].arrayBuffer());
	const source = audioContext.createBufferSource();
	source.buffer = buffer;
  
	const fftSize = 2048;
	const analyser = audioContext.createAnalyser();
	analyser.fftSize = fftSize;
	const fftBuffer = new Float32Array(analyser.frequencyBinCount);
	const timeDomainBuffer = new Float32Array(analyser.fftSize);
  
	// Connect the source to the analyser
	source.connect(analyser);
	source.start();
  
	// Wait for the data to be processed before fetching it
	await new Promise(resolve => setTimeout(resolve, 100));
  
	analyser.getFloatFrequencyData(fftBuffer);
	analyser.getFloatTimeDomainData(timeDomainBuffer);
  
	source.disconnect(analyser);
  
	const sineWaves = [];
  
	for (let i = 0; i < fftBuffer.length; i++) {
	  const frequency = i * audioContext.sampleRate / (2 * fftBuffer.length);
	  // Get amplitude from fftBuffer
	  const amplitudeInDB = fftBuffer[i];
  
	  if (isFinite(amplitudeInDB)) {
		sineWaves.push({ frequency, amplitude: amplitudeInDB });
	  }
	}
  
	console.log('Raw sine waves:', sineWaves);
  
	// Filter out sine waves with non-finite amplitude values
	const filteredSineWaves = sineWaves.filter(sineWave => isFinite(sineWave.amplitude));
  
	filteredSineWaves.sort((a, b) => b.amplitude - a.amplitude);
  
	displaySineWaves(filteredSineWaves.slice(0, 100));
	console.log('Filtered sine waves:', filteredSineWaves);
  }
  
  
  function displaySineWaves(filteredSineWaves) {
	const sineWavesList = document.getElementById("sine-waves-list");
	sineWavesList.innerHTML = '';
  
	filteredSineWaves.forEach(sineWave => {
	  const listItem = document.createElement("li");
	  const checkbox = document.createElement("input");
	  checkbox.type = "checkbox";
	  checkbox.addEventListener('change', async event => {
		await handleSineWaveCheckbox(event, sineWave.frequency, sineWave.amplitude);
	  });
	  listItem.appendChild(checkbox);
  
	  listItem.appendChild(document.createTextNode(`Frequency: ${sineWave.frequency.toFixed(2)} Hz, Amplitude: ${sineWave.amplitude.toFixed(2)} dB`));
	  sineWavesList.appendChild(listItem);
	});
  }
  


  // Analyseボタンがクリックされたときに実行される関数
  
  analyseBtn.addEventListener('click', async () => {
	await analyseRecording();
	document.getElementById("sine-waves").style.display = "block";
	analyseBtn.disabled = true;
	sineWaveBtn.disabled = false;
	sineWaveBtn.style.fontWeight = 'bold';
  });
  
  
  sineWaveBtn.addEventListener('click', () => {
    // Stop playing sine waves
    const sineWavesList = document.getElementById("sine-waves-list");
    const checkboxes = sineWavesList.getElementsByTagName("input");
    for (const checkbox of checkboxes) {
        if (checkbox.checked) {
            checkbox.checked = false;
            checkbox.dispatchEvent(new Event('change'));
        }
    }
});

  
  

