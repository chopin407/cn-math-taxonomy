# 错题专练与进度交换

## 收集与定位

- 输入可为错题图片、文本、站内诊断结果 JSON 或本技能的进度 JSON。图片按 [图片识读与变式](image-variants.md) 转写。保留原题、学生答案、能看清的关键步骤、来源题号和主知识点。
- 诊断 JSON 使用仓库导出的 `tool: "cn-math-taxonomy/diagnose"`、`version: 2`。用 `node .agents/skills/math-question-generator/scripts/check.js diagnosis <诊断JSON>` 提取错题与「不会」，并查看无法定位的记录。若只有薄弱点或缺少可读原题，按知识点出定位题。学生答案与参考答案不足以确定具体错误步骤时，也先出一道定位题，要求写出关键一步。范围外的记录单独列出。
- 按「主知识点 + 有证据的错因」归组。例如有理数运算下的负号误用和运算顺序错误分别出题。依据包括实际作答步骤或定位题反馈。未确认的错因用 `null`，先保留原题各自的定位记录。用户明确只想按知识点练习时，可按知识点成组，说明尚未定位具体错因。

## 专练与复测

每组先出一道 `targeted` 题，练习发生错误的步骤，再用两道 `variant` 题复测同一方法。原题、定位题和针对练习题可以讲解，但答对这些题不计入复测。两道变式必须不同，换编号或标点不算。进度显示 `0/2`、`1/2` 或「已巩固」。任一专练题答错或跳过会清除本轮累计。未提交或待人工核对的答案保持 `ungraded`。

判题时对可化成有理数的结果检查等值分数和小数。式子、证明和开放题结合原题条件、数学等价性及评分点判定。没有足够信息就补问，不能因写法不同直接判错。已巩固是这组复测的结果。后续发现同类错误时记入该组并重新专练。

## 跨会话继续

只在用户要求导出时生成进度 JSON。导出前和导入后执行 `node .agents/skills/math-question-generator/scripts/check.js progress <进度JSON>`，根据原题与有序作答记录重算每组状态。相同快照再次导入无需重复追加。修改作答时更新原记录，继续做新题时在对应组末尾追加记录。多份不同进度文件优先询问使用哪份；需要合并时以组 ID、作答 ID 去重，时间顺序或结果冲突时先确认。

```json
{
  "format": "cn-math-taxonomy.math-question-progress",
  "version": 1,
  "groups": [{
    "id": "review-1",
    "topicId": "cnm_035",
    "error": {"label": "括号前负号导致漏变号", "evidence": "原题去括号后把 −(−4) 写成 −4"},
    "originals": [{"prompt": "化简 3x − (x − 4)。", "userAnswer": "2x − 4", "result": "wrong"}],
    "attempts": [{
      "id": "review-1-a1", "kind": "variant", "prompt": "化简 5x − (2x − 7)。",
      "userAnswer": "3x + 7", "result": "correct"
    }]
  }]
}
```

`originals[].result` 支持 `wrong`、`skip`、`unknown`，原题可附 `questionId`。只有知识点、原题缺失时可令 `originals` 为空列表。`attempts[].kind` 支持 `probe`、`targeted`、`variant`，结果支持 `correct`、`wrong`、`skip`、`ungraded`。每组 ID 唯一，每组内作答 ID 唯一。`attempts` 按实际作答顺序保存，判题有疑问可保留 `ungraded`。进度文件只保存数学内容及作答，省去姓名、学校、原始图片和档案资料。选定教材范围后仍需检查是否能在范围内继续该组。
