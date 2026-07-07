// 共有状態ストア（計画 1.4-A）。
//
// state.ts は「グローバル変数の引っ越し」ではない。ここに置くのは main.ts が
// 生成し sinewaveAnalyser.ts が読む、真にファイルをまたぐ 2 項目
// （audioContext / recordedChunks）のみ。waveVisualizer/spectrumVisualizer の
// インスタンスや mediaRecorder 等、単一ファイル内でしか使われない状態はここに
// 置かず、そのファイルのローカル変数のまま残す。
//
// 移行期の例外（1.4-A）: audioContext は ESM 化（M2-8）と init() 集約（M2-9）が
// 絡むため、この state.audioContext（プロパティ変更方式）で受ける。M2-11 で
// AppContext 純注入へ収斂させる。
export interface AppState {
  audioContext: AudioContext | undefined;
  recordedChunks: Blob[];
}

export const state: AppState = {
  audioContext: undefined,
  recordedChunks: [],
};
