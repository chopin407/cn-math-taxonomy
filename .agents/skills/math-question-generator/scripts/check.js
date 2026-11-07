'use strict';

const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../../../..');
const engine = require(path.join(root, 'diagnose', 'engine.js'));
const topics = require(path.join(root, 'data', 'topics.json'));
const math = new Map(topics.filter(t => !t.external && engine.subjectOf(t) === 'math').map(t => [t.id, t]));

const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const unique = values => new Set(values).size === values.length;
const promptKey = value => value.normalize('NFC').replace(/\s+/g, '').replace(/[−－]/g, '-').replace(/[。.!！?？]+$/u, '');

function requireThat(condition, message) {
  if (!condition) throw new Error(message);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
}

function location(topic) {
  const { chapterNo, chapterName, section } = engine.parseChapter(topic.chapter);
  return { id: topic.id, name: topic.name, chapter: [chapterNo, chapterName].filter(Boolean).join(' '), chapterNo, section };
}

function resolveScope(input) {
  requireThat(input && nonempty(input.edition), '缺少教材版本。');
  const { edition, grade, term, chapter, topicIds } = input;
  requireThat(topicIds === undefined || (Array.isArray(topicIds) && topicIds.length && unique(topicIds)), 'topicIds 须是非空且不重复的列表。');
  if (edition === 'user-supplied') {
    requireThat(nonempty(input.label) && nonempty(input.source) && nonempty(chapter) && topicIds, '用户目录范围须有版本册次、章名、依据及已确认的知识点 ID。');
    requireThat(topicIds.every(id => math.has(id)), '用户目录包含未知或非数学知识点。');
    const catalog = topicIds.map(id => ({ id, name: math.get(id).name, chapter, section: '' }));
    return { edition, label: input.label, source: input.source, status: 'user-supplied', topics: catalog };
  }

  requireThat(Number.isInteger(grade) && grade >= 1 && grade <= 14 && ['上', '下', '全'].includes(term), '教材范围须包含有效年级和册次。');
  requireThat(chapter === undefined || nonempty(chapter), '章名不能为空。');
  let catalog;
  let status;
  let source;
  let label;
  if (edition === 'renjiao_math') {
    catalog = [...math.values()].filter(t => t.grade === grade && t.semester === term).map(location);
    status = 'repository';
    source = 'data/topics.json';
    label = grade >= 10 ? '人教 A 版（2019）' : '人教版';
  } else {
    requireThat(/^[a-z][a-z0-9_]*_math$/.test(edition), '没有该数学教材版本的对照表。');
    const file = path.join(root, 'data', 'mappings', edition + '.json');
    requireThat(fs.existsSync(file), '没有该数学教材版本的对照表，请提供目录。');
    const mapping = readJson(file);
    ({ status, source, label } = mapping);
    requireThat(['draft', 'reviewed'].includes(status), '对照表仅供示例，请提供目录。');
    catalog = mapping.entries.filter(row => row.grade === grade && row.term === term && math.has(row.topicId)).map(row => ({
      id: row.topicId, name: math.get(row.topicId).name,
      chapter: row.unit || row.chapter || '章名待确认', section: row.unit ? row.chapter || '' : ''
    }));
  }
  if (chapter !== undefined) catalog = catalog.filter(row => row.chapter === chapter.trim() || row.chapterNo === chapter.trim());
  requireThat(catalog.length, '没有匹配到该册次或章节的知识点，请核对版本与目录。');
  if (topicIds !== undefined) {
    const allowed = new Set(catalog.map(row => row.id));
    requireThat(topicIds.every(id => allowed.has(id)), '指定知识点超出教材范围或尚无该版本映射。');
    catalog = catalog.filter(row => topicIds.includes(row.id));
  }
  return { edition, label, grade, term, status, source, topics: catalog };
}

function checkWorksheet(input) {
  requireThat(input && Number.isInteger(input.count) && input.count > 0 && Array.isArray(input.questions), '须提供题量和题目列表。');
  const { questions, count } = input;
  requireThat(questions.length === count, '实际题量与承诺不一致。');
  const allowed = new Set(resolveScope(input.scope).topics.map(topic => topic.id));
  for (const q of questions) {
    requireThat(q && ['id', 'prompt', 'answer', 'explanation'].every(key => nonempty(q[key])), '题号、题干、答案和解析均必填。');
    const prefix = '第 ' + q.id + ' 题';
    const related = q.relatedTopicIds === undefined ? [] : q.relatedTopicIds;
    requireThat(Array.isArray(related), prefix + '的关联知识点须为列表。');
    const ids = [q.topicId, ...related];
    requireThat(ids.every(id => allowed.has(id)) && unique(ids), prefix + '存在范围外或重复的知识点。');
    requireThat(['basic', 'standard', 'challenge'].includes(q.difficulty), prefix + '的难度无效。');
    requireThat(['numeric', 'choice', 'short', 'self'].includes(q.type), prefix + '的题型无效。');
    if (q.type === 'choice') {
      const choices = q.choices;
      requireThat(Array.isArray(choices) && [3, 4].includes(choices.length) && choices.every((c, i) => c && c.key === 'ABCD'[i] && nonempty(c.text)), prefix + '的选项格式有误。');
      requireThat(choices.some(c => c.key === q.answer) && unique(choices.map(c => promptKey(c.text))), prefix + '的选项重复或答案未指向选项。');
    }
  }
  requireThat(unique(questions.map(q => q.id)) && unique(questions.map(q => promptKey(q.prompt))), '有重复题号或题干。');
  return { valid: true, count };
}

function importDiagnosis(input) {
  requireThat(input && input.tool === 'cn-math-taxonomy/diagnose' && input.version === 2 && Array.isArray(input.answers), '请选择本站导出的第 2 版诊断 JSON。');
  const questions = new Map(require(path.join(root, 'data', 'questions.json')).map(q => [q.id, q]));
  const candidates = [];
  const unresolved = [];
  for (const [i, row] of input.answers.entries()) {
    if (!row || !['wrong', 'skip'].includes(row.result)) continue;
    const question = questions.get(row.questionId);
    const id = row.topicId || question?.topicId;
    if (!math.has(id) || (question && question.topicId !== id)) {
      unresolved.push({ order: i + 1, topicId: row.topicId, questionId: row.questionId });
      continue;
    }
    candidates.push({
      topicId: id, questionId: row.questionId, result: row.result, prompt: row.prompt || question?.prompt || null,
      userAnswer: row.userAnswer ?? null, referenceAnswer: row.referenceAnswer || question?.answer || null
    });
  }
  return { candidates, unresolved };
}

function checkProgress(input) {
  requireThat(input && input.format === 'cn-math-taxonomy.math-question-progress' && input.version === 1 && Array.isArray(input.groups), '请选择本技能导出的第 1 版错题进度 JSON。');
  const seen = new Set();
  return input.groups.map(group => {
    requireThat(group && nonempty(group.id) && !seen.has(group.id) && math.has(group.topicId), '错题组编号重复、为空或知识点无效。');
    seen.add(group.id);
    const { error, originals, attempts } = group;
    requireThat(error === null || (error && nonempty(error.label) && nonempty(error.evidence)), '错因或证据不完整。');
    requireThat(Array.isArray(originals) && originals.every(q => q && nonempty(q.prompt) && ['wrong', 'skip', 'unknown'].includes(q.result)), '原题记录无效。');
    requireThat(Array.isArray(attempts) && attempts.every(a => a && nonempty(a.id) && nonempty(a.prompt) && ['probe', 'targeted', 'variant'].includes(a.kind) && ['correct', 'wrong', 'skip', 'ungraded'].includes(a.result)) && unique(attempts.map(a => a.id)), '作答记录无效或编号重复。');
    const excluded = new Set(originals.concat(attempts.filter(a => a.kind !== 'variant')).map(q => promptKey(q.prompt)));
    const passed = new Set();
    for (const attempt of attempts) {
      if (['wrong', 'skip'].includes(attempt.result)) passed.clear();
      const key = promptKey(attempt.prompt);
      if (attempt.kind === 'variant' && attempt.result === 'correct' && !excluded.has(key)) passed.add(key);
    }
    const streak = Math.min(2, passed.size);
    return { id: group.id, topicId: group.topicId, streak, status: streak === 2 ? '已巩固' : error === null && streak === 0 ? '待定位' : '待复测' };
  });
}

try {
  const [command, file] = process.argv.slice(2);
  const commands = new Map([['scope', resolveScope], ['worksheet', checkWorksheet], ['diagnosis', importDiagnosis], ['progress', checkProgress]]);
  requireThat(file && commands.has(command), '用法：node check.js <scope|worksheet|diagnosis|progress> <JSON 文件>');
  console.log(JSON.stringify(commands.get(command)(readJson(file)), null, 2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
