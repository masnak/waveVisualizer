---
name: mite
description: macOS の screencapture で Chrome ウィンドウや画面全体のスクリーンショットを撮影する。「スクショ撮って」「画面キャプチャ」で自動起動。
allowed-tools: Read, Bash
argument-hint: "[--full] [--window <app名>] [--name <filename>]"
---

# mite: macOS スクリーンショットスキル

macOS の `screencapture` コマンドで Chrome ウィンドウや画面全体を撮影する。
ウィンドウキャプチャは CGWindowID 指定（`-l`）方式を使い、背景アプリの写り込みを防ぐ。

## 保存先

`.ai-machine-workspace/screen-shot/` に保存する。

## 引数

- **引数なし**: Google Chrome のフロントウィンドウをキャプチャ
- **--full（任意）**: 画面全体をキャプチャ
- **--window（任意）**: 指定アプリ名のウィンドウをキャプチャ（例: `--window "Cursor"`）
- **--name（任意）**: 保存ファイル名（拡張子なし）。省略時は `chrome-{timestamp}` or `screen-{timestamp}`

## 実行手順

### 1. 保存ディレクトリを作成

```bash
mkdir -p .ai-machine-workspace/screen-shot
```

### 2. キャプチャ対象を決定

#### 引数なし: Chrome ウィンドウキャプチャ

Swift で CGWindowID を取得し、`screencapture -l` でウィンドウ単体を撮影する:

```bash
WINID=$(swift -e '
import CoreGraphics
let windowList = CGWindowListCopyWindowInfo(.optionOnScreenOnly, kCGNullWindowID) as! [[String: Any]]
for w in windowList {
    if let owner = w[kCGWindowOwnerName as String] as? String,
       owner == "Google Chrome",
       let layer = w[kCGWindowLayer as String] as? Int,
       layer == 0,
       let num = w[kCGWindowNumber as String] as? Int {
        print(num)
        break
    }
}
')
screencapture -x -o -l "$WINID" ".ai-machine-workspace/screen-shot/${FILENAME}.png"
```

- `-x`: 撮影音を消す
- `-o`: ウィンドウの影を含めない
- `-l <id>`: 指定ウィンドウのみを撮影（背景が写り込まない）

#### `--window <app名>`: 指定アプリのウィンドウキャプチャ

Swift の `owner ==` 部分をアプリ名に変更して同じ方式で撮影する:

```bash
WINID=$(swift -e '
import CoreGraphics
let windowList = CGWindowListCopyWindowInfo(.optionOnScreenOnly, kCGNullWindowID) as! [[String: Any]]
for w in windowList {
    if let owner = w[kCGWindowOwnerName as String] as? String,
       owner == "APP_NAME",
       let layer = w[kCGWindowLayer as String] as? Int,
       layer == 0,
       let num = w[kCGWindowNumber as String] as? Int {
        print(num)
        break
    }
}
')
screencapture -x -o -l "$WINID" ".ai-machine-workspace/screen-shot/${FILENAME}.png"
```

`APP_NAME` はプロセス表示名（例: `Cursor`, `Safari`, `Terminal`）で指定する。

#### `--full`: 画面全体キャプチャ

```bash
screencapture -x ".ai-machine-workspace/screen-shot/${FILENAME}.png"
```

### 3. ファイル名の決定

- `--name` 指定時: そのまま使用
- 省略時:
  - 引数なし: `chrome-{YYYYMMDD-HHmmss}.png`
  - `--window`: `{アプリ名小文字}-{YYYYMMDD-HHmmss}.png`
  - `--full`: `screen-{YYYYMMDD-HHmmss}.png`

### 4. 撮影したスクリーンショットを Read ツールで表示する

### 5. 画像の内容を確認して報告する

Read ツールで画像を表示した後、以下を報告する:

- 保存先のファイルパス
- キャプチャ対象
- 画像サイズ
- **画面に見えている内容の簡潔な説明**（例: 表示中のページ名、主要な UI 要素、データの状態、エラーメッセージの有無など）

## CGWindowID 取得に失敗した場合

Swift が使えない、またはウィンドウが見つからない場合のフォールバック:

1. `--full` でのフルスクリーンキャプチャを提案する
2. または対話的選択を提案:
   ```
   ターミナルで ! screencapture -i .ai-machine-workspace/screen-shot/filename.png を実行してください
   ```

## 使用例

```
/mite                              # Chrome ウィンドウを撮影
/mite --full                       # 画面全体を撮影
/mite --window "Cursor"            # Cursor ウィンドウを撮影
/mite --name dashboard             # Chrome を dashboard.png で保存
```
