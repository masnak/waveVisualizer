// 共有状態ストア（計画 1.4-A）。
//
// state.ts は「グローバル変数の引っ越し」ではない。ここに置くのは真に
// ファイルをまたいで共有される残余の状態（recordedChunks）のみ。
// waveVisualizer/spectrumVisualizer のインスタンスや mediaRecorder 等、
// 単一ファイル内でしか使われない状態はここに置かず、そのファイルの
// ローカル変数のまま残す。
//
// audioContext は M2-11 で AppContext 純注入へ収斂したため、ここには
// 含めない（context.ts の AppContext を参照）。
export interface AppState {
  recordedChunks: Blob[];
}

export const state: AppState = {
  recordedChunks: [],
};
