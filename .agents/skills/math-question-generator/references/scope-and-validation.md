# 教材范围与题目核验

从仓库根目录运行 `node .agents/skills/math-question-generator/scripts/check.js scope <范围JSON>`。输入为 UTF-8，输出包含匹配到的知识点、名称、章、节、教材依据和映射状态。临时 JSON 放在临时目录。

```json
{"edition":"renjiao_math","grade":7,"term":"上","chapter":"第二章"}
```

- `edition` 为 `renjiao_math` 或 `data/mappings/` 中实际存在的数学版本 ID。人教版按 `data/topics.json` 的正式数学点筛选。小学和初中用 `grade` 和 `term`（`上`、`下`、`全`）。高中人教 A 版用 `grade` 10–14 分别表示必修第一、第二册和选择性必修第一至第三册，按库用 `term: "上"`，面向用户显示教材册名。只有章名或节名时先查整册并消歧。`chapter` 使用输出里的完整章名或 `chapterNo`，`topicIds` 可进一步缩小范围，不能扩大。
- 非人教版本使用正式对照表中的 `grade`、`term`、`unit` 和 `chapter`，跳过示例映射。展示 `draft` 的待核状态与来源。映射不全时说明只覆盖已对照的部分。需要覆盖未对照章节时，依据用户提供的目录与图谱做匹配。将明确对应的 `topicIds` 和目录依据放入 `user-supplied` 范围，例如 `{"edition":"user-supplied","label":"用户提供的版本和册次","chapter":"用户目录上的章名","source":"上传目录的相应章节","topicIds":["cnm_035"]}`。有多个可能匹配时先询问，未匹配部分留待确认。
- 用 `data/questions.json` 按 `topicId` 取样题。生成前检查能否达到所需题量，生成后把题干与原例题、参考题及已出题做对照。照搬或只改名字和标点的题不算有效变式。

交付前为生成批次准备结构化检查输入，执行 `node .agents/skills/math-question-generator/scripts/check.js worksheet <批次JSON>`。`scope` 与已确认范围一致，`count` 是承诺交付的题量。例子如下。

```json
{
  "scope": {"edition":"renjiao_math","grade":7,"term":"上","chapter":"第四章"},
  "count": 1,
  "questions": [{
    "id":"1","topicId":"cnm_035","relatedTopicIds":["cnm_034"],
    "difficulty":"standard","type":"short","prompt":"化简 5x − (2x − 7)。",
    "answer":"3x + 7","explanation":"括号前是减号，去括号后得 5x − 2x + 7，再合并同类项。"
  }]
}
```

- `type` 支持 `numeric`、`choice`、`short`、`self`，`difficulty` 支持 `basic`、`standard`、`challenge`。选择题须给 3–4 个按 A–D 排列的 `{key,text}`，答案填正确选项字母。开放题和证明题用 `self`，附评分点。`relatedTopicIds` 可省略。
- 检查器校验题量、字段、主辅考点范围及表面重复。它无法从标签推断题目是否实际超纲，也无法证明数学答案正确。另从题干和选项复解后比对答案。对有理数计算、整式运算和方程用精确运算或代回复核，检查分母、取值、单位及选项等价。不能用出题时的同一条表达式作为唯一核验。对文字题复核条件是否充分，对开放题确认评分点和可接受的其他解法。
- 用户提供了额外图形时，核对图文标注相符。学生版须具备全部可读条件。要用图形时提供完整标注，不能靠示意图比例推断条件。
