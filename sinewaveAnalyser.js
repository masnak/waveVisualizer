// sinwaveAnalyser.js

// サイン波を再生するための関数
async function playSineWave(frequency, amplitude) {
	const oscillator = audioContext.createOscillator();
	const gainNode = audioContext.createGain();
  
	oscillator.frequency.value = frequency;
	gainNode.gain.value = amplitude;
	oscillator.connect(gainNode);
	gainNode.connect(audioContext.destination);
  
	oscillator.start();
	return oscillator;
  }
  
  // サイン波のチェックボックスをハンドルする関数
  function handleSineWaveCheckbox(event, frequency, amplitude) {
	if (event.target.checked) {
	  const oscillator = playSineWave(frequency, amplitude);
	  event.target.oscillator = oscillator;
	} else {
	  event.target.oscillator.stop();
	}
  }
  
  // サイン波を並び替えてリストに表示する関数
  function displaySineWaves(sineWaves) {
	const sineWavesList = document.getElementById("sine-waves-list");
	sineWavesList.innerHTML = '';
  
	sineWaves.forEach(sineWave => {
	  const listItem = document.createElement("li");
	  const checkbox = document.createElement("input");
	  checkbox.type = "checkbox";
	  checkbox.addEventListener('change', event => {
		handleSineWaveCheckbox(event, sineWave.frequency, sineWave.amplitude);
	  });
	  listItem.appendChild(checkbox);
	  listItem.appendChild(document.createTextNode(`Frequency: ${sineWave.frequency.toFixed(2)} Hz, Amplitude: ${sineWave.amplitude.toFixed(5)}`));
	  sineWavesList.appendChild(listItem);
	});
  }
  
  // Analyseボタンがクリックされたときに実行される関数
  async function analyseRecording() {
	const buffer = await audioContext.decodeAudioData(await recordedChunks[0].arrayBuffer());
	const channelData = buffer.getChannelData(0);
  
	const fftSize = 2048;
	const analyser = audioContext.createAnalyser();
	analyser.fftSize = fftSize;
	const fftBuffer = new Float32Array(analyser.frequencyBinCount);
	const timeDomainBuffer = new Float32Array(analyser.fftSize);
  
	analyser.getFloatFrequencyData(fftBuffer);
	analyser.getFloatTimeDomainData(timeDomainBuffer);
  
	const sineWaves = [];
  
	for (let i = 0; i < fftBuffer.length; i++) {
	  const frequency = i * audioContext.sampleRate / (2 * fftBuffer.length);
	  const amplitude = Math.abs(fftBuffer[i]);
	  sineWaves.push({ frequency, amplitude });
	}
  
	sineWaves.sort((a, b) => b.amplitude - a.amplitude);
  
	displaySineWaves(sineWaves.slice(0, 10));
  }
  
  analyseBtn.addEventListener('click', async () => {
	await analyseRecording();
	document.getElementById("sine-waves").style.display = "block";
	analyseBtn.disabled = true;
	sineWaveBtn.disabled = false;
	sineWaveBtn.style.fontWeight = 'bold';
  });
  
  sineWaveBtn.addEventListener('click', async () => {
	// 再生中のサイン波を停止
	const sineWavesList = document.getElementById("sine-waves-list");
	const checkboxes = sineWavesList.getElementsByTagName("input");
	for (const checkbox of checkboxes) {
	  if (checkbox.checked) {
		checkbox.checked = false;
		checkbox.oscillator.stop();
	  }
	}
  });
  
  