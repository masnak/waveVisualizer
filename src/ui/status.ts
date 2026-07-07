// main.js の showStatusMessage() をそのまま複製した born-ESM モジュール（M2-8）。
// sinewaveAnalyser.ts から独立して import できるよう、main.ts より先に切り出す
// （main.ts 側は自身の ESM 化＝M2-8 の最終ステップで、この関数を import する側に
// 切り替える。それまでは classic 側に同名関数がそのまま残る＝挙動は複製元と一致）。
export type StatusType = 'success' | 'error';

export function showStatusMessage(message: string, type: StatusType = 'success'): void {
  // 原実装（main.js）に忠実: 要素が存在しない場合のガードは追加しない
  const statusElement = document.getElementById('status-message')!;
  statusElement.textContent = message;
  statusElement.className = `status-message status-${type}`;
  statusElement.style.display = 'block';

  setTimeout(() => {
    statusElement.style.display = 'none';
  }, 3000);
}
