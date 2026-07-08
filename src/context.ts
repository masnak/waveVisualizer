// AppContext（計画 1.4-A の達成点、M2-11）。
//
// audioContext は main.ts が生成し、init() 集約時に sinewaveAnalyser.ts へ
// 明示的に注入する。ユーザーが「初期化」ボタンを押すまで存在しないため、
// フィールドは可変（同一オブジェクト参照を共有し、生成後に main.ts がこの
// フィールドへ書き込む）。state.ts の「移行期の例外」だった state.audioContext
// はここへ収斂し、state.ts には真に残余の共有状態（recordedChunks）のみ残る。
export interface AppContext {
  audioContext: AudioContext | undefined;
}
