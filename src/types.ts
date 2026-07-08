// 共有型定義（計画 1.2 節: 早期に定義。M2-7 の dsp.ts から利用開始）。

export interface FrequencyComponent {
  frequency: number;
  /** 最大成分基準の dB 値（表示用） */
  amplitude: number;
  /** DFT から得られる生振幅（相対音量・音声合成の計算に使用） */
  rawAmplitude: number;
  /** ラジアン */
  phase: number;
}

export interface AnalysisResult {
  components: FrequencyComponent[];
  maxAmplitude: number;
}

/** 音声合成計算に必要な最小限のフィールド（M2-10、audio/synthesis.ts で使用） */
export type SynthesisComponent = Pick<FrequencyComponent, 'frequency' | 'rawAmplitude' | 'phase'>;

/** チェックボックスの選択状態（DOM 要素ではなくプレーンデータ、計画 1.2） */
export interface CheckboxState {
  id: string;
  checked: boolean;
}
