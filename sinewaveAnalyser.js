// sinwaveAnalyser.js

// グローバル変数：解析結果の最大振幅を保存（相対音量計算用）
let maxAnalysisAmplitude = 0;
// グローバル変数：位相情報付き周波数成分を保存
let frequencyComponents = [];
// グローバル変数：合成音声用AudioBuffer
let synthesizedBuffer = null;

// 位相情報付きサイン波を再生するための関数
async function playSineWave(frequency, amplitude, rawAmplitude, phase = 0) {
	try {
		console.log(`Creating sine wave: ${frequency.toFixed(2)} Hz, phase: ${phase.toFixed(3)} rad (${(phase * 180 / Math.PI).toFixed(1)}°)`);
		
		// 短い時間の位相制御可能なAudioBufferを生成
		const duration = 5; // 5秒間の連続再生
		const sampleRate = audioContext.sampleRate;
		const length = Math.floor(duration * sampleRate);
		const buffer = audioContext.createBuffer(1, length, sampleRate);
		const data = buffer.getChannelData(0);
		
		// 相対振幅を正確に保持した音量計算
		let gainValue;
		if (maxAnalysisAmplitude > 0 && rawAmplitude > 0) {
			const relativeAmplitude = rawAmplitude / maxAnalysisAmplitude;
			const baseGainLevel = 0.15;
			gainValue = relativeAmplitude * baseGainLevel;
			gainValue = Math.max(gainValue, 0.001);
			gainValue = Math.min(gainValue, 0.3);
		} else {
			gainValue = 0.05;
		}
		
		// 位相を考慮した正弦波を生成
		for (let i = 0; i < length; i++) {
			const time = i / sampleRate;
			data[i] = gainValue * Math.sin(2 * Math.PI * frequency * time + phase);
		}
		
		// AudioBufferSourceNodeで再生
		const source = audioContext.createBufferSource();
		source.buffer = buffer;
		source.connect(audioContext.destination);
		
		// Audio contextの状態を確認
		if (audioContext.state === 'suspended') {
			await audioContext.resume();
		}
		
		source.start();
		console.log(`Phase-controlled sine wave started: ${frequency.toFixed(2)} Hz, phase: ${phase.toFixed(3)} rad, gain: ${gainValue.toFixed(6)}`);
		
		return { 
			source, 
			buffer,
			frequency,
			amplitude,
			rawAmplitude,
			phase,
			gainValue,
			stop: () => {
				try {
					source.stop();
					console.log(`Sine wave stopped: ${frequency.toFixed(2)} Hz`);
				} catch (e) {
					console.log('Source already stopped');
				}
			}
		};
	} catch (error) {
		console.error('Error creating phase-controlled sine wave:', error);
		return null;
	}
}

// 位相情報付き音声合成（選択された成分から完全な音声を生成）
async function synthesizeSelectedComponents() {
	try {
		console.log('=== 位相制御音声合成開始 ===');
		
		// チェックされた成分を取得
		const sineWavesList = document.getElementById("sine-waves-list");
		const checkboxes = sineWavesList.getElementsByTagName("input");
		const selectedComponents = [];
		
		console.log(`チェックボックス総数: ${checkboxes.length}`);
		
		for (let i = 0; i < checkboxes.length; i++) {
			const checkbox = checkboxes[i];
			console.log(`チェックボックス ${i}: ID=${checkbox.id}, checked=${checkbox.checked}`);
			
			if (checkbox.checked && checkbox.id.startsWith('sine-wave-')) {
				const index = parseInt(checkbox.id.replace('sine-wave-', ''));
				console.log(`選択された成分インデックス: ${index}`);
				
				if (frequencyComponents[index]) {
					selectedComponents.push({
						...frequencyComponents[index],
						originalIndex: index
					});
					console.log(`成分追加: ${frequencyComponents[index].frequency.toFixed(1)} Hz, 位相: ${(frequencyComponents[index].phase * 180 / Math.PI).toFixed(1)}°`);
				}
			}
		}
		
		if (selectedComponents.length === 0) {
			console.warn('合成用の成分が選択されていません');
			if (typeof showStatusMessage === 'function') {
				showStatusMessage('周波数成分を選択してから合成再生ボタンを押してください', 'error');
			}
			return null;
		}
		
		console.log(`=== ${selectedComponents.length}個の成分で音声合成を実行 ===`);
		
		// 選択された成分の詳細情報を表示
		selectedComponents.forEach((comp, idx) => {
			const relativeAmp = comp.rawAmplitude / maxAnalysisAmplitude;
			console.log(`成分 ${idx + 1}: ${comp.frequency.toFixed(1)} Hz - 相対振幅: ${relativeAmp.toFixed(4)} - 位相: ${(comp.phase * 180 / Math.PI).toFixed(1)}°`);
		});
		
		// 元録音と同じ長さのバッファを作成
		const duration = 2; // 元録音と同じ2秒
		const sampleRate = audioContext.sampleRate;
		const length = Math.floor(duration * sampleRate);
		const buffer = audioContext.createBuffer(1, length, sampleRate);
		const data = buffer.getChannelData(0);
		
		console.log(`合成音声バッファ作成: ${duration}秒, ${sampleRate}Hz, ${length}サンプル`);
		
		// バッファを初期化
		for (let i = 0; i < length; i++) {
			data[i] = 0;
		}
		
		// 各選択成分を位相情報付きで加算合成
		selectedComponents.forEach((comp, idx) => {
			console.log(`\n--- 成分 ${idx + 1} の合成処理開始 ---`);
			console.log(`周波数: ${comp.frequency.toFixed(2)} Hz`);
			console.log(`位相: ${comp.phase.toFixed(4)} ラジアン (${(comp.phase * 180 / Math.PI).toFixed(2)}°)`);
			console.log(`生振幅: ${comp.rawAmplitude.toExponential(4)}`);
			
			// 人間の声再現用に音量を調整
			const relativeAmplitude = comp.rawAmplitude / maxAnalysisAmplitude;
			
			// 人間の声に適した音量設定
			let baseGainLevel;
			if (relativeAmplitude > 0.5) {
				baseGainLevel = 0.4; // 主要成分
			} else if (relativeAmplitude > 0.1) {
				baseGainLevel = 0.3; // 重要成分
			} else {
				baseGainLevel = 0.2; // 補助成分
			}
			
			let gainValue = relativeAmplitude * baseGainLevel;
			
			// 音量の下限と上限を設定
			gainValue = Math.max(gainValue, 0.002); // 最小音量を上げる
			gainValue = Math.min(gainValue, 0.6);   // 最大音量を上げる
			
			console.log(`相対振幅: ${relativeAmplitude.toFixed(4)}`);
			console.log(`最終ゲイン: ${gainValue.toFixed(6)}`);
			
			// 位相制御された正弦波を生成して加算
			let addedSampleCount = 0;
			let maxAddedValue = 0;
			
			for (let i = 0; i < length; i++) {
				const time = i / sampleRate;
				const sampleValue = gainValue * Math.sin(2 * Math.PI * comp.frequency * time + comp.phase);
				data[i] += sampleValue;
				
				if (Math.abs(sampleValue) > maxAddedValue) {
					maxAddedValue = Math.abs(sampleValue);
				}
				addedSampleCount++;
			}
			
			console.log(`追加したサンプル数: ${addedSampleCount}`);
			console.log(`この成分の最大振幅: ${maxAddedValue.toFixed(6)}`);
		});
		
		console.log('\n=== 合成後の波形解析 ===');
		
		// 合成後の波形統計
		let maxSample = 0;
		let minSample = 0;
		let rmsSum = 0;
		
		for (let i = 0; i < length; i++) {
			const sample = data[i];
			if (sample > maxSample) maxSample = sample;
			if (sample < minSample) minSample = sample;
			rmsSum += sample * sample;
		}
		
		const rmsLevel = Math.sqrt(rmsSum / length);
		console.log(`合成波形の最大値: ${maxSample.toFixed(6)}`);
		console.log(`合成波形の最小値: ${minSample.toFixed(6)}`);
		console.log(`合成波形のRMS: ${rmsLevel.toFixed(6)}`);
		
		// 適応的正規化（人間の声に適した音量に調整）
		let normalizationFactor = 1.0;
		const targetRMS = 0.1; // 目標RMS レベル
		
		if (rmsLevel > 0) {
			if (maxSample > 0.8) {
				// クリッピング防止
				normalizationFactor = 0.8 / Math.max(Math.abs(maxSample), Math.abs(minSample));
				console.log(`クリッピング防止による正規化: ${normalizationFactor.toFixed(4)}`);
			} else if (rmsLevel < targetRMS * 0.1) {
				// 音量が小さすぎる場合の増幅
				normalizationFactor = targetRMS / rmsLevel;
				normalizationFactor = Math.min(normalizationFactor, 5.0); // 最大5倍まで
				console.log(`音量増幅による正規化: ${normalizationFactor.toFixed(4)}`);
			}
		}
		
		// 正規化を適用
		if (normalizationFactor !== 1.0) {
			for (let i = 0; i < length; i++) {
				data[i] *= normalizationFactor;
			}
			console.log(`正規化適用完了。係数: ${normalizationFactor.toFixed(4)}`);
		}
		
		// 最終的な音量確認
		let finalMax = 0;
		let finalRMS = 0;
		for (let i = 0; i < length; i++) {
			const sample = Math.abs(data[i]);
			if (sample > finalMax) finalMax = sample;
			finalRMS += data[i] * data[i];
		}
		finalRMS = Math.sqrt(finalRMS / length);
		
		console.log(`最終波形の最大振幅: ${finalMax.toFixed(6)}`);
		console.log(`最終波形のRMS: ${finalRMS.toFixed(6)}`);
		
		synthesizedBuffer = buffer;
		console.log('=== 位相制御音声合成完了 ===');
		
		// 成功メッセージ
		if (typeof showStatusMessage === 'function') {
			showStatusMessage(`${selectedComponents.length}個の成分で位相制御音声合成が完了しました。再生します...`);
		}
		
		return buffer;
		
	} catch (error) {
		console.error('位相制御音声合成でエラー:', error);
		if (typeof showStatusMessage === 'function') {
			showStatusMessage('音声合成中にエラーが発生しました: ' + error.message, 'error');
		}
		return null;
	}
}

// 合成音声を再生
async function playSynthesizedAudio() {
	try {
		if (!synthesizedBuffer) {
			console.warn('合成音声バッファがありません');
			if (typeof showStatusMessage === 'function') {
				showStatusMessage('先に「合成再生」ボタンを押してください', 'error');
			}
			return;
		}
		
		console.log('=== 合成音声の再生開始 ===');
		console.log(`バッファ情報: ${synthesizedBuffer.duration.toFixed(2)}秒, ${synthesizedBuffer.sampleRate}Hz`);
		
		const source = audioContext.createBufferSource();
		source.buffer = synthesizedBuffer;
		source.connect(audioContext.destination);
		
		if (audioContext.state === 'suspended') {
			await audioContext.resume();
			console.log('AudioContext resumed');
		}
		
		source.start();
		console.log('合成音声の再生を開始しました');
		
		if (typeof showStatusMessage === 'function') {
			showStatusMessage('位相制御で合成された音声を再生中...');
		}
		
		source.onended = () => {
			console.log('合成音声の再生が終了しました');
			if (typeof showStatusMessage === 'function') {
				showStatusMessage('合成音声の再生が完了しました。「原音との比較」で聞き比べてください。');
			}
		};
		
	} catch (error) {
		console.error('合成音声再生でエラー:', error);
		if (typeof showStatusMessage === 'function') {
			showStatusMessage('合成音声の再生でエラーが発生しました: ' + error.message, 'error');
		}
	}
}
  
// サイン波のチェックボックスをハンドルする関数
async function handleSineWaveCheckbox(event, frequency, amplitude, rawAmplitude, phase = 0) {
	try {
		console.log(`Checkbox ${event.target.checked ? 'checked' : 'unchecked'} for ${frequency.toFixed(2)} Hz`);
		
		if (event.target.checked) {
			const sineWavePlayer = await playSineWave(frequency, amplitude, rawAmplitude, phase);
			if (sineWavePlayer) {
				event.target.sineWavePlayer = sineWavePlayer;
				console.log(`Started sine wave: ${frequency.toFixed(2)} Hz, phase: ${phase.toFixed(3)} rad`);
			} else {
				event.target.checked = false;
				console.error('Failed to create sine wave player');
			}
		} else {
			if (event.target.sineWavePlayer) {
				event.target.sineWavePlayer.stop();
				event.target.sineWavePlayer = null;
				console.log(`Stopped sine wave: ${frequency.toFixed(2)} Hz`);
			}
		}
	} catch (error) {
		console.error('Error handling sine wave checkbox:', error);
		event.target.checked = false;
	}
}
  
// 位相情報付きサイン波リストを表示する関数
function displaySineWaves(sineWaves) {
	const sineWavesList = document.getElementById("sine-waves-list");
	sineWavesList.innerHTML = '';
	
	// 音声再現実験の説明を追加
	const explanationItem = document.createElement("li");
	explanationItem.innerHTML = `
		<div style="background-color: #e7f3ff; padding: 10px; border-radius: 5px; margin-bottom: 10px;">
			<strong>位相情報付き音声再現実験:</strong> 
			各周波数成分の音量と位相が元音声と同じに設定されています。
			「合成再生」ボタンで選択した成分を位相制御で合成再生できます。
		</div>
	`;
	sineWavesList.appendChild(explanationItem);
	
	// 合成再生ボタンを追加
	const synthesisControlItem = document.createElement("li");
	synthesisControlItem.innerHTML = `
		<div style="background-color: #f0f8f0; padding: 15px; border-radius: 5px; margin-bottom: 15px; border: 2px solid #4CAF50;">
			<div style="margin-bottom: 10px;">
				<strong style="color: #2c5530;">🎵 位相制御音声合成</strong>
			</div>
			<div style="margin-bottom: 10px;">
				<button id="auto-select-btn" style="background-color: #FF9800; color: white; border: none; padding: 10px 20px; margin-right: 10px; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 14px;">
					✅ 全てを選択
				</button>
				<button id="auto-deselect-btn" style="background-color: #F44336; color: white; border: none; padding: 10px 20px; margin-right: 10px; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 14px;">
					❌ 全てを解除
				</button>
				<button id="synthesize-btn" style="background-color: #4CAF50; color: white; border: none; padding: 10px 20px; margin-right: 10px; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 14px;">
					🔊 合成再生
				</button>
				<button id="compare-btn" style="background-color: #2196F3; color: white; border: none; padding: 10px 20px; margin-right: 10px; border-radius: 4px; cursor: pointer; font-size: 14px;" disabled>
					⚖️ 原音との比較
				</button>
			</div>
			<div style="font-size: 12px; color: #555; line-height: 1.4;">
				<strong>音声合成のコツ:</strong><br>
				• 「全てを選択」で解析された全ての周波数成分を選択<br>
				• 「全てを解除」で選択を一括解除（再生中の音も停止）<br>
				• ★1〜★5の上位成分を必ず選択<br>
				• 基本周波数（一番低い★1）とその倍音（★2, ★3...）を含める<br>
				• 必要に応じて個別に成分を選択・解除できます
			</div>
		</div>
	`;
	sineWavesList.appendChild(synthesisControlItem);
	
	// 全て選択機能
	document.getElementById('auto-select-btn').addEventListener('click', () => {
		try {
			console.log('=== 全成分選択開始 ===');
			
			if (frequencyComponents.length === 0) {
				if (typeof showStatusMessage === 'function') {
					showStatusMessage('解析データがありません。先にAnalyseボタンを押してください。', 'error');
				}
				return;
			}
			
			// 全てのチェックボックスを選択
			const checkboxes = sineWavesList.getElementsByTagName("input");
			let selectedCount = 0;
			
			for (const checkbox of checkboxes) {
				if (checkbox.id.startsWith('sine-wave-')) {
					if (!checkbox.checked) {
						checkbox.checked = true;
						selectedCount++;
						// changeイベントは発火させない（音が同時に鳴るのを避ける）
					}
				}
			}
			
			console.log(`全${frequencyComponents.length}個の成分を選択しました`);
			
			if (typeof showStatusMessage === 'function') {
				showStatusMessage(`解析された全${frequencyComponents.length}個の成分を選択しました。「合成再生」を押してください。`);
			}
			
		} catch (error) {
			console.error('全選択でエラー:', error);
			if (typeof showStatusMessage === 'function') {
				showStatusMessage('全選択でエラーが発生しました: ' + error.message, 'error');
			}
		}
	});
	
	// 全て解除機能
	document.getElementById('auto-deselect-btn').addEventListener('click', () => {
		try {
			console.log('=== 全成分解除開始 ===');
			
			// 全てのチェックボックスを解除
			const checkboxes = sineWavesList.getElementsByTagName("input");
			let deselectedCount = 0;
			
			for (const checkbox of checkboxes) {
				if (checkbox.id.startsWith('sine-wave-') || checkbox.id.startsWith('test-wave-')) {
					if (checkbox.checked) {
						checkbox.checked = false;
						// changeイベントを発火させて対応するサイン波を停止
						checkbox.dispatchEvent(new Event('change'));
						deselectedCount++;
					}
				}
			}
			
			console.log(`${deselectedCount}個の成分を解除し、対応するサイン波を停止しました`);
			
			if (typeof showStatusMessage === 'function') {
				if (deselectedCount > 0) {
					showStatusMessage(`${deselectedCount}個の成分を解除し、再生中のサイン波を停止しました。`);
				} else {
					showStatusMessage('解除する成分がありませんでした。');
				}
			}
			
		} catch (error) {
			console.error('全解除でエラー:', error);
			if (typeof showStatusMessage === 'function') {
				showStatusMessage('全解除でエラーが発生しました: ' + error.message, 'error');
			}
		}
	});
	
	// イベントリスナーを追加
	document.getElementById('synthesize-btn').addEventListener('click', async () => {
		const synthesizeBtn = document.getElementById('synthesize-btn');
		const originalText = synthesizeBtn.textContent;
		
		// ボタンを無効化してフィードバック
		synthesizeBtn.disabled = true;
		synthesizeBtn.textContent = '🔄 合成中...';
		synthesizeBtn.style.backgroundColor = '#FFA500';
		
		try {
			const buffer = await synthesizeSelectedComponents();
			if (buffer) {
				await playSynthesizedAudio();
				document.getElementById('compare-btn').disabled = false;
			}
		} catch (error) {
			console.error('合成再生でエラー:', error);
			if (typeof showStatusMessage === 'function') {
				showStatusMessage('合成再生でエラーが発生しました: ' + error.message, 'error');
			}
		} finally {
			// ボタンを元に戻す
			synthesizeBtn.disabled = false;
			synthesizeBtn.textContent = originalText;
			synthesizeBtn.style.backgroundColor = '#4CAF50';
		}
	});
	
	document.getElementById('compare-btn').addEventListener('click', async () => {
		// 原音再生（比較用）
		if (recordedChunks && recordedChunks.length > 0) {
			try {
				const buffer = await audioContext.decodeAudioData(await recordedChunks[0].arrayBuffer());
				const source = audioContext.createBufferSource();
				source.buffer = buffer;
				source.connect(audioContext.destination);
				source.start();
				
				if (typeof showStatusMessage === 'function') {
					showStatusMessage('🎤 原音を再生中（合成音と比較してください）');
				}
				
				source.onended = () => {
					if (typeof showStatusMessage === 'function') {
						showStatusMessage('原音の再生が完了しました。違いを確認できましたか？');
					}
				};
			} catch (error) {
				console.error('原音再生でエラー:', error);
				if (typeof showStatusMessage === 'function') {
					showStatusMessage('原音の再生でエラーが発生しました', 'error');
				}
			}
		} else {
			if (typeof showStatusMessage === 'function') {
				showStatusMessage('原音データがありません。録音を行ってください。', 'error');
			}
		}
	});
  
	if (sineWaves.length === 0) {
		const noDataItem = document.createElement("li");
		noDataItem.innerHTML = `
			<div>解析できる周波数成分が見つかりませんでした。</div>
			<div style="margin-top: 10px;">
				<strong>テスト用の固定周波数:</strong>
			</div>
		`;
		
		// テスト用の固定周波数を追加
		const testFrequencies = [
			{freq: 440, amp: maxAnalysisAmplitude || 0.1, phase: 0}, 
			{freq: 880, amp: (maxAnalysisAmplitude || 0.1) * 0.5, phase: Math.PI/4}, 
			{freq: 1320, amp: (maxAnalysisAmplitude || 0.1) * 0.25, phase: Math.PI/2}
		];
		testFrequencies.forEach((item, index) => {
			const testItem = document.createElement("li");
			const checkbox = document.createElement("input");
			checkbox.type = "checkbox";
			checkbox.id = `test-wave-${index}`;
			checkbox.addEventListener('change', async event => {
				await handleSineWaveCheckbox(event, item.freq, -20, item.amp, item.phase);
			});
			
			const label = document.createElement("label");
			label.htmlFor = `test-wave-${index}`;
			label.textContent = `Test: ${item.freq} Hz - 位相: ${(item.phase * 180 / Math.PI).toFixed(1)}° - 相対音量: ${(item.amp/(maxAnalysisAmplitude||0.1)).toFixed(2)}`;
			label.style.color = '#666';
			
			testItem.appendChild(checkbox);
			testItem.appendChild(label);
			sineWavesList.appendChild(testItem);
		});
		
		return;
	}
	
	sineWaves.forEach((sineWave, index) => {
		const listItem = document.createElement("li");
		const checkbox = document.createElement("input");
		checkbox.type = "checkbox";
		checkbox.id = `sine-wave-${index}`;
		checkbox.addEventListener('change', async event => {
			await handleSineWaveCheckbox(event, sineWave.frequency, sineWave.amplitude, sineWave.rawAmplitude, sineWave.phase);
		});
		
		const label = document.createElement("label");
		label.htmlFor = `sine-wave-${index}`;
		
		// 順位表示、相対音量、位相情報を追加
		const rank = index + 1;
		const rankDisplay = rank <= 10 ? `★${rank}` : `${rank}`;
		const relativeVolume = maxAnalysisAmplitude > 0 ? (sineWave.rawAmplitude / maxAnalysisAmplitude) : 0;
		const phaseDegrees = (sineWave.phase * 180 / Math.PI).toFixed(1);
		
		label.textContent = `${rankDisplay}. ${sineWave.frequency.toFixed(1)} Hz - 音量: ${relativeVolume.toFixed(3)} (${(relativeVolume*100).toFixed(1)}%) - 位相: ${phaseDegrees}°`;
		
		// 上位成分を強調表示
		if (rank <= 10) {
			label.style.fontWeight = 'bold';
			label.style.color = '#2c5530';
		}
		
		// 相対音量に応じた視覚的強調
		if (relativeVolume > 0.5) {
			label.style.backgroundColor = '#e8f5e8';
		} else if (relativeVolume > 0.1) {
			label.style.backgroundColor = '#f0f8f0';
		}
		
		listItem.appendChild(checkbox);
		listItem.appendChild(label);
		sineWavesList.appendChild(listItem);
	});
	
	console.log(`Displayed ${sineWaves.length} sine wave components with phase information`);
}

// 位相情報保持FFT解析
async function analyseRecording() {
	try {
		console.log('Starting phase-preserving audio analysis...');
		
		if (!recordedChunks || recordedChunks.length === 0) {
			throw new Error('No recorded audio data available');
		}

		// 録音データをAudioBufferにデコード
		const buffer = await audioContext.decodeAudioData(await recordedChunks[0].arrayBuffer());
		
		console.log('Buffer info:', {
			duration: buffer.duration,
			sampleRate: buffer.sampleRate,
			numberOfChannels: buffer.numberOfChannels,
			length: buffer.length
		});

		const channelData = buffer.getChannelData(0);
		const fftSize = 16384;
		
		// 音声データの統計情報を計算
		let maxAmplitude = 0;
		let rmsAmplitude = 0;
		
		for (let i = 0; i < channelData.length; i++) {
			const val = Math.abs(channelData[i]);
			if (val > maxAmplitude) maxAmplitude = val;
			rmsAmplitude += val * val;
		}
		rmsAmplitude = Math.sqrt(rmsAmplitude / channelData.length);
		
		console.log('Audio data statistics:', {
			maxAmplitude,
			rmsAmplitude,
			totalSamples: channelData.length
		});
		
		// 位相情報保持のための改善されたDFT実装
		const windowSize = Math.min(fftSize, channelData.length);
		
		// ハミング窓を適用
		const window = new Float32Array(windowSize);
		for (let i = 0; i < windowSize; i++) {
			window[i] = 0.54 - 0.46 * Math.cos(2 * Math.PI * i / (windowSize - 1));
		}
		
		// 窓関数の正規化係数を計算
		let windowSum = 0;
		for (let i = 0; i < windowSize; i++) {
			windowSum += window[i];
		}
		const windowNormalization = windowSize / windowSum;
		
		// 位相情報付きDFT実行
		const frequencyData = [];
		maxAnalysisAmplitude = 0;
		
		for (let k = 0; k < fftSize / 2; k++) {
			let realSum = 0;
			let imagSum = 0;
			
			for (let n = 0; n < windowSize; n++) {
				const angle = -2 * Math.PI * k * n / fftSize;
				const windowedSample = channelData[n] * window[n];
				realSum += windowedSample * Math.cos(angle);
				imagSum += windowedSample * Math.sin(angle);
			}
			
			// 振幅と位相を計算
			const magnitude = Math.sqrt(realSum * realSum + imagSum * imagSum);
			const phase = Math.atan2(imagSum, realSum);
			const amplitude = magnitude * windowNormalization / windowSize;
			
			if (amplitude > maxAnalysisAmplitude) {
				maxAnalysisAmplitude = amplitude;
			}
			
			frequencyData.push({
				amplitude: amplitude,
				phase: phase,
				real: realSum,
				imag: imagSum
			});
		}
		
		console.log('Phase-preserving FFT analysis completed');
		console.log(`Maximum analysis amplitude: ${maxAnalysisAmplitude.toExponential(3)}`);
		console.log('Sample phase data:', frequencyData.slice(1, 6).map(f => `${f.amplitude.toExponential(2)} @ ${(f.phase * 180 / Math.PI).toFixed(1)}°`));

		const sineWaves = [];
		const sampleRate = audioContext.sampleRate;
		const nyquistFreq = sampleRate / 2;
		
		// 位相情報保持のための動的閾値
		let avgFreqAmplitude = 0;
		let nonZeroCount = 0;
		
		for (let i = 1; i < frequencyData.length; i++) {
			if (frequencyData[i].amplitude > 0) {
				avgFreqAmplitude += frequencyData[i].amplitude;
				nonZeroCount++;
			}
		}
		avgFreqAmplitude = nonZeroCount > 0 ? avgFreqAmplitude / nonZeroCount : 0;
		
		const dynamicThreshold = Math.max(
			avgFreqAmplitude * 0.02,
			maxAnalysisAmplitude * 0.001,
			0.00000001
		);
		
		console.log('Dynamic threshold for phase preservation:', dynamicThreshold.toExponential(3));
		
		// 各周波数ビンを位相情報付きで分析
		for (let i = 1; i < frequencyData.length; i++) {
			const frequency = (i * nyquistFreq) / (fftSize / 2);
			const freqData = frequencyData[i];
			
			// dB変換（表示用）
			let amplitudeDB;
			if (freqData.amplitude > 0) {
				amplitudeDB = 20 * Math.log10(freqData.amplitude / maxAnalysisAmplitude);
			} else {
				amplitudeDB = -Infinity;
			}
			
			// 位相情報と振幅情報を保持
			if (freqData.amplitude > dynamicThreshold && isFinite(amplitudeDB)) {
				sineWaves.push({ 
					frequency: frequency, 
					amplitude: amplitudeDB,
					rawAmplitude: freqData.amplitude,
					phase: freqData.phase // 位相情報を保持
				});
			}
		}

		console.log('Sine waves found with phase information:', sineWaves.length, 'components');
		console.log('First few components with phase:', sineWaves.slice(0, 5));

		// 振幅順にソート
		sineWaves.sort((a, b) => b.rawAmplitude - a.rawAmplitude);

		// グローバル変数に保存（合成用）
		frequencyComponents = sineWaves.slice(0, Math.min(100, sineWaves.length));
		
		displaySineWaves(frequencyComponents);
		
		console.log(`Phase-preserving analysis complete. Displaying ${frequencyComponents.length} components`);
		console.log(`Reference amplitude: ${maxAnalysisAmplitude.toExponential(3)}`);
		
		return frequencyComponents.length;
		
	} catch (error) {
		console.error('Error during phase-preserving audio analysis:', error);
		throw error;
	}
}
  
const analyseBtn = document.getElementById('analyse-btn');
const sineWaveBtn = document.getElementById('sine-wave-btn');
  
analyseBtn.addEventListener('click', async () => {
	try {
		if (typeof showStatusMessage === 'function') {
			showStatusMessage('位相情報保持で音声解析を開始しています...');
		}
		
		const componentCount = await analyseRecording();
		document.getElementById("sine-waves").style.display = "block";
		analyseBtn.disabled = true;
		sineWaveBtn.disabled = false;
		sineWaveBtn.style.fontWeight = 'bold';
		
		if (typeof showStatusMessage === 'function') {
			if (componentCount > 0) {
				showStatusMessage(`解析完了！${componentCount}個の成分で位相情報付き音声再現が可能です。`);
			} else {
				showStatusMessage('解析完了。テスト用の固定周波数を使用できます。');
			}
		}
	} catch (error) {
		console.error('Error in analyse button handler:', error);
		if (typeof showStatusMessage === 'function') {
			showStatusMessage('解析中にエラーが発生しました: ' + error.message, 'error');
		}
	}
});
  
sineWaveBtn.addEventListener('click', () => {
	try {
		const sineWavesList = document.getElementById("sine-waves-list");
		const checkboxes = sineWavesList.getElementsByTagName("input");
		
		let stoppedCount = 0;
		for (const checkbox of checkboxes) {
			if (checkbox.checked) {
				checkbox.checked = false;
				checkbox.dispatchEvent(new Event('change'));
				stoppedCount++;
			}
		}
		console.log(`Stopped ${stoppedCount} sine waves`);
		
		if (typeof showStatusMessage === 'function') {
			showStatusMessage(`${stoppedCount}個の正弦波を停止しました`);
		}
	} catch (error) {
		console.error('Error stopping sine waves:', error);
	}
});
  
  

  
  