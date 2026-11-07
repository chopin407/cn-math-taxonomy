'use strict';

const assert = require('node:assert/strict');
const { books, categories } = require('../practice/bank.js');
const engine = require('../practice/engine.js');
const topics = new Map(require('../data/topics.json').map(topic => [topic.id, topic]));
const [book] = books;
const ids = new Set();
for (const family of book.families) {
  const topic = topics.get(family.topicId);
  assert.equal(topic?.grade, 7, family.id);
  assert.equal(topic.semester, '上', family.id);
  assert.ok(categories.some(category => category.id === family.category), family.id);
  assert.ok(family.questions.length >= 4, family.id);
  for (const question of family.questions) {
    assert.ok(!ids.has(question.id), question.id);
    ids.add(question.id);
    assert.equal(engine.judge(question, question.answers), true, question.id);
  }
}
assert.equal(ids.size, 48);

const [family] = book.families;
const [original, variantA, variantB, variantC] = family.questions;
const rational = book.families.find(f => f.id === 'divide-fraction').questions[0];
assert.equal(engine.judge(rational, ['２／１２']), true);
assert.equal(engine.judge(rational, ['-1/-6']), true);
assert.equal(engine.judge(rational, ['1/5']), false);
for (const invalid of ['', '1/0', '1/0.0', '2+2', '2cm', 'NaN']) {
  assert.equal(engine.judge(rational, [invalid]), null);
}
const algebra = book.families.find(f => f.id === 'minus-brackets').questions[0];
assert.equal(engine.judge(algebra, ['−2.0', '8/2']), true);
assert.equal(engine.judge(algebra, ['4', '-2']), false);
assert.equal(engine.judge(algebra, ['-2']), null);

// 反复做对原题或同一道变式不能清除错题，任何一次答错会清空当前的巩固进度。
const rounds = [];
let time = 0;
function add(mode, question, correct) {
  time++;
  rounds.push({
    id: 'round-' + time, startedAt: time, size: 1, mode,
    attempts: [{ qid: question.id, at: time, correct, inputs: correct ? question.answers : ['999'] }]
  });
  return engine.analyze(book, rounds.slice().reverse());
}
let progress = engine.analyze(book, []);
assert.equal(engine.practiceQuestions(book, null, progress).length, 12);
assert.equal(new Set(engine.practiceQuestions(book, family.category, progress).map(q => q.id)).size, 6);
progress = add('mixed', original, false);
assert.equal(engine.practiceQuestions(book, null, progress)[0], variantA);
assert.equal(engine.reviewQuestions(progress, family.id)[0], variantA);
progress = add('original', original, true);
assert.equal(progress.mistakes.get(family.id).passed.size, 0);
progress = add('review', variantA, true);
progress = add('review', variantA, true);
assert.equal(progress.mistakes.get(family.id).passed.size, 1);
assert.equal(engine.reviewQuestions(progress, family.id)[0], variantB);
progress = add('review', variantB, false);
assert.equal(progress.mistakes.get(family.id).passed.size, 0);
assert.equal(progress.mistakes.get(family.id).misses, 2);
assert.equal(engine.reviewQuestions(progress, family.id)[0], variantC);
progress = add('review', variantC, true);
progress = add('review', variantA, true);
assert.equal(progress.mistakes.size, 0);
assert.deepEqual(progress.byCategory.get(family.category), { total: 7, correct: 5 });
progress = add('mixed', original, false);
assert.equal(progress.mistakes.get(family.id).misses, 1);

const items = new Map();
const storage = {
  get length() { return items.size; },
  key: i => [...items.keys()][i],
  getItem: key => items.get(key),
  setItem: (key, value) => items.set(key, value)
};
engine.saveRound(storage, 'first-child', book.id, rounds[0]);
engine.saveRound(storage, 'first-child', book.id, rounds[1]);
engine.saveRound(storage, 'first-child', book.id, rounds[0]);
engine.saveRound(storage, 'second-child', book.id, rounds[2]);
assert.deepEqual(engine.loadRounds(storage, 'first-child', book.id), rounds.slice(0, 2));
assert.deepEqual(engine.loadRounds(storage, 'second-child', book.id), [rounds[2]]);
assert.deepEqual(engine.loadRounds(storage, 'first-child', 'other-book'), []);
console.log('计算专项题库、判题、错题巩固和本机记录测试通过');
