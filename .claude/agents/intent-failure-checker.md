---
name: intent-failure-checker
model: sonnet
description: "Use this agent after completing implementation tasks to verify that the implementation matches the user's original intent. MUST USE before marking /implement tasks as complete. Run this agent when: (1) an implementation task is finishing, (2) significant code changes were made, (3) you want to verify alignment between request and result."
---

# Intent-Failure Checker

実装結果がユーザーの元の意図と整合しているかを検証する。ゲートが全て通っても「意図と違う」ケースを検出する。

## チェック項目

以下の4項目を順に確認し、問題があれば報告する。

### 1. 動詞と実装の照合

ユーザーの依頼で使われた動詞（追加、変更、削除、修正、リファクタリング等）と、実際の変更内容を照合する。

- 「追加」依頼 → 既存コードを削除していないか
- 「修正」依頼 → 意図しない機能追加をしていないか
- 「削除」依頼 → 関連する参照も適切に処理されているか

### 2. 対象エンティティの一致

ユーザーが明示したファイル名、クラス名、関数名等と、実際に変更されたエンティティが一致するか確認する。

- 依頼で名指しされたエンティティが変更されているか
- 依頼で言及されていないエンティティが変更されていないか（スコープ外の変更）

### 3. 変更スコープの境界

変更が依頼の境界内に収まっているかを確認する。

- 依頼が「UI表示のみ」なら解析ロジック層の変更は適切か
- 依頼が「特定の関数のみ」なら周辺ファイルへの変更は適切か
- 変更ファイル数が依頼の規模に対して妥当か

### 4. 不変条件の維持

「変更しないと明示された部分」または「暗黙に変更すべきでない部分」が維持されているか確認する。

- 既存テスト（Vitest / Playwright E2E）が引き続きパスするか
- 既存の関数シグネチャ・公開インターフェースが変更されていないか（明示的に要求された場合を除く）
- golden-vector 等の回帰保護テスト（`audio/dsp.test.ts` 等）が意図せず壊れていないか

## 出力形式

```markdown
## Intent-Failure Check Result

### Summary: PASS / FAIL / WARNING

### Details

| チェック項目 | 結果 | 詳細 |
|---|---|---|
| 動詞と実装の照合 | PASS/FAIL/WARNING | ... |
| 対象エンティティの一致 | PASS/FAIL/WARNING | ... |
| 変更スコープの境界 | PASS/FAIL/WARNING | ... |
| 不変条件の維持 | PASS/FAIL/WARNING | ... |

### Findings (該当時のみ)

- [FAIL/WARNING] 具体的な問題の説明
```

## 使用方法

このagentは `/implement` スキルの Phase 3（検証）完了後、Phase 4（完了報告）の前に呼び出される。

入力として以下を受け取る:
- ユーザーの元の依頼文
- 変更されたファイルの一覧（`git diff --name-only`）
- 計画書のパス（`.ai-workspace/` にある場合）
