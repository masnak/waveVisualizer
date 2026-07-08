# 準持続音（「あー」等）のフーリエ分解・再合成 — 音質改善提案

作成日: 2026-07-08
関連: `.ai-workspace/20260708-001-voice-synthesis-fidelity-research.md`（前段の文献調査。連続音声を前提とした過大スコープの提案①〜④を含む。本レポートはその一部をアプリの実際の目的に合わせて訂正・再構成したもの）
対象: `src/audio/dsp.ts` の `analyseFrequencyComponents()`

---

## 0. 前提の訂正

このアプリは「連続的な話し言葉を音声合成する」ことが目的ではない。**録音対象は口笛や「あー」等の持続音（CLAUDE.md 記載）**であり、目的は「フーリエ分解で複数のサイン波に分け、それを合成すると元の複雑な波形に戻る」ことを実感できる教材である。

持続音は定義上ほぼ定常（準定常）信号であり、これは音響音声学において **持続母音の音響分析（sustained vowel acoustic analysis）** という確立された分析パラダイムが対応する領域である。前段のレポート（20260708-001）が主軸に据えた McAulay–Quatieri 方式のような「フレームごとに繰り返し分析し時間変化を追跡する」手法は、連続音声（絶えずピッチ・フォルマントが変化する話し言葉）向けの技術であり、このアプリの対象には**過大スコープ**だった。本レポートはその訂正版として、持続音に適した、より小規模で確立された改善策に絞って提案する。

---

## 1. 現状の実装の問題点（コード確認済み）

`src/audio/dsp.ts` の `analyseFrequencyComponents()`:

```ts
const windowSize = Math.min(fftSize, channelData.length);
```

- `fftSize` のデフォルトは 16384。サンプルレート 44.1kHz なら `windowSize` ≈ 371ms
- 解析対象は `channelData[0]` から `channelData[windowSize - 1]`、つまり**録音の先頭371ms分のみ**
- 録音は2秒間（≈88,200サンプル）だが、残り約1.6秒は解析に一切使われない
- 合成時（`src/audio/synthesis.ts` の `synthesizeAudioSamples`）は、この1回きりの分析結果（固定の振幅・位相）を2秒間そのまま延ばして再生する

**問題**: 音響音声学において、録音・発声の**先頭部分は分析に使うべきでない過渡区間**であることが確立している（2節参照）。現行実装はまさにこの「避けるべき区間」だけを分析対象にしている。反応の遅れによる無音、声の立ち上がり（アタック）、声道形状が目的の母音に定まるまでの遷移が、この371msに混入している可能性が高い。

---

## 2. 確立された手法との対比

### 2.1 オンセット（過渡区間）の除外

持続母音の音響分析研究では、録音の前後の過渡区間を除外し、安定した中間部分のみを分析することが標準的手法とされている:

> Vowels are typically cut to exclude 500ms at the front and 500ms at the end of the signal, removing the onset and offset segments of the sample.
> To neutralize the effects of vocal attack, the beginning of the recording of each vowel is discarded.

（出典: [The Effect of Segment Selection on Acoustic Analysis (PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC3244564/)）

### 2.2 長期平均スペクトル（LTAS）

より長い区間を分析に使うことで、声帯振動の周期ごとの微小な揺らぎ（ジッター・シマー）が平均化され、その音の「代表的な」周波数構成がより安定して抽出できる。これは Long-Term Average Spectrum（LTAS）という確立された音声分析手法の考え方である:

> LTAS analysis offers representative information on voice timbre providing spectral information averaged over time, and is particularly useful when persistent spectral features are under investigation.

（出典: [The Long-Term Average Spectrum as a Measure of Voice Stability](https://www.researchgate.net/publication/14436310_The_Long-Term_Average_Spectrum_as_a_Measure_of_Voice_Stability)）

臨床用途のLTAS研究では20秒以上のサンプルを推奨しているが、これは高精度測定のための目安であり、本アプリの2秒の録音でも「371ms→1秒程度」に延ばすだけで、371msだけの場合と比べて有意な安定性向上が見込める。

---

## 3. 実装上の制約（重要な発見）

`dsp.ts` は自前の**ナイーブ DFT**（FFTではない）であり、計算量は概ね `O((fftSize/2) × windowSize)`（周波数ビンの数 × 解析サンプル数の総当たり）。

現行コードは `windowSize = Math.min(fftSize, channelData.length)` として、**周波数分解能を決める `fftSize` と、解析に使うサンプル数を決める `windowSize` が同一変数に結合**されている。これを分離せずに `fftSize` を単純に3倍にすると、計算量は **9倍**に増える（2乗で効いてくる）。

**対応**: `windowSize` を `fftSize` から独立したパラメータとして扱い、周波数分解能（`fftSize=16384`、約2.7Hz/bin）は現状維持したまま `windowSize` だけを伸ばす。この場合、計算量は `windowSize` に対して線形にしか増えない。371ms→1000ms（約2.7倍）なら、計算時間の増加も概ね2.7倍程度に収まる見込み。

---

## 4. 位相に関する注意点

「複数の短い窓を独立に分析して平均する」（Welch法的な発想）は、位相保持の観点からは避けるべきである。ジッターにより窓ごとに位相がわずかに回転するため、位相までベクトル平均すると成分同士が打ち消し合う可能性がある。

本アプリは位相情報の保持・活用が設計上の核（音声合成の位相制御）なので、**「複数窓を平均する」のではなく「1つの十分に長い窓を、過渡区間を避けた位置から取る」**方式を採るべきである。これなら単一の一貫した位相が得られ、既存の「DFTで振幅・位相を同時抽出する」という設計をそのまま拡張できる。

---

## 5. 提案（優先順位順）

### 提案①（最優先・低コスト）: 分析開始オフセットの導入

- 録音先頭からの分析開始位置に、過渡区間を避けるためのオフセットを設ける
- 目安: 録音先頭 400〜500ms を除外し、そこから分析窓を取る
- 2秒間の録音のうち、末尾側にも録音停止時の打ち切りアーチファクトの可能性があるため、末尾側にも 200〜300ms 程度のマージンを残す
- 実装: `analyseFrequencyComponents()` に `offsetSamples`（または offset 秒数）パラメータを追加し、`channelData[n]` の参照を `channelData[offset + n]` に変更する

### 提案②（最優先・低コスト）: 解析窓の拡張（`windowSize` と `fftSize` の分離）

- `windowSize` を `fftSize` から独立させ、周波数分解能はそのままに解析対象サンプル数を増やす
- 目安: `windowSize` ≈ 1000ms（44.1kHzで約44100サンプル）。オフセット400ms + 窓1000ms なら録音終端まで600ms残り、末尾マージンとも両立できる
- 計算コストの増加は約2.7倍（3節参照）。実測での確認が必要（提案③参照）

### 提案③（検証必須）: パフォーマンス実測

- 提案①②を適用した状態で、実際のブラウザ（特にモバイル等の非力な環境も視野に）で解析にかかる時間を計測する
- ナイーブDFTのため、`windowSize` を伸ばしすぎるとUIがブロックされる懸念がある。必要なら `windowSize` の上限を適切な値に調整する

### 提案④（任意・低優先）: フォルマント帯域を意識した成分選択

- 20260708-001 レポートの提案Cと同内容。単純な振幅上位100ではなく、周波数帯域ごとに区切って選択することで、母音の識別に必要な情報（フォルマント帯域）を優先的に残す
- 本レポートの主眼（オンセット回避・窓拡張）と独立して検討可能。まず①②の効果を確認してから着手する方が優先度として妥当

---

## 6. 意図的にスコープ外とする事項

- **フレームベースの時間変化追跡合成**（20260708-001 の提案A・B、McAulay–Quatieri 方式の完全な実装）: 連続音声（時々刻々ピッチ・フォルマントが変化する話し言葉）向けの技術であり、持続音を前提とする本アプリの教材としての目的には過大。本アプリが「複数の音素を含む発話」を扱うようになった場合に再検討する
- **複数窓の平均化**: 4節の理由により、位相保持の設計目標と相性が悪いため見送る

---

## 7. まとめ

| 項目 | 現状 | 提案後 |
|---|---|---|
| 分析対象 | 録音先頭0〜371ms（過渡区間を含む） | 録音400ms〜1400ms付近（安定した定常部分） |
| 窓長 | 371ms | 約1000ms |
| 周波数分解能 | 2.7Hz/bin | 2.7Hz/bin（変更なし） |
| 計算コスト | 現状比 1.0倍 | 現状比 約2.7倍（要実測） |
| 位相の扱い | 単一窓で保持（変更なし） | 単一窓で保持（変更なし、より安定した窓から取得） |

**結論**: 持続音を対象とする本アプリの目的に照らすと、最優先の改善は「フレーム化」ではなく「①過渡区間を避ける」「②より長い定常区間を1回のDFTに使う」の2点であり、いずれも `dsp.ts` の `analyseFrequencyComponents()` に対する比較的小規模な変更（オフセット追加・`windowSize`/`fftSize` 分離）で実現できる。

---

## 参考文献

- [The Effect of Segment Selection on Acoustic Analysis (PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC3244564/)
- [The Long-Term Average Spectrum as a Measure of Voice Stability (ResearchGate)](https://www.researchgate.net/publication/14436310_The_Long-Term_Average_Spectrum_as_a_Measure_of_Voice_Stability)
- [Long-Term Average Spectrum in Screening of Voice Quality in Speech (Journal of Voice)](https://www.jvoice.org/article/S0892-1997(08)00048-9/abstract)
- [Jitter and Shimmer in Sustained Phonation (ScienceDirect)](https://www.sciencedirect.com/science/article/pii/B9780126086072500169)
- 前段レポート: `.ai-workspace/20260708-001-voice-synthesis-fidelity-research.md`
