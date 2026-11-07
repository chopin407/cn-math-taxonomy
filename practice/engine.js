(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../diagnose/engine.js'));
  else root.CnmPractice = factory(root.DiagEngine);
})(typeof self === 'undefined' ? this : self, function (numeric) {
  'use strict';

  const STORAGE = 'cnmPractice.rounds.v1:';
  const prefix = (profile, book) => STORAGE + encodeURIComponent(profile) + ':' + book + ':';

  // 每轮独立保存。两个标签页各自答题时不会覆盖彼此的记录。
  function saveRound(storage, profile, book, round) {
    storage.setItem(prefix(profile, book) + round.id, JSON.stringify(round));
  }

  function loadRounds(storage, profile, book) {
    const start = prefix(profile, book);
    const rounds = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (!key || !key.startsWith(start)) continue;
      try {
        const round = JSON.parse(storage.getItem(key));
        if (round && typeof round.id === 'string' && Array.isArray(round.attempts)) rounds.push(round);
      } catch (e) {
        if (!(e instanceof SyntaxError)) throw e;
      }
    }
    return rounds;
  }

  function judge(question, inputs) {
    if (inputs.length !== question.answers.length) return null;
    const valid = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+|\d+\/[+-]?\d+)$/;
    const results = inputs.map((input, i) => {
      const options = question.fields?.[i]?.options;
      if (options) return options.includes(input) ? input === question.answers[i] : null;
      const value = numeric.normalizeText(input);
      if (!valid.test(value) || (/\//.test(value) && Number(value.split('/')[1]) === 0)) return null;
      const normalized = value.replace(/^([+-]?)(\d+)\/([+-])(\d+)$/, (_, ns, n, ds, d) =>
        ((ns === '-') !== (ds === '-') ? '-' : '') + n + '/' + d
      );
      const result = numeric.judgeQuestion({ type: 'numeric', answer: question.answers[i] }, normalized);
      return result.verdict === 'manual' ? null : result.verdict === 'correct';
    });
    return results.includes(null) ? null : results.every(Boolean);
  }

  function analyze(book, rounds) {
    const families = new Map(book.families.map(family => [family.id, family]));
    const questions = new Map(book.families.flatMap(family => family.questions.map(q => [q.id, q])));
    const attempts = rounds.flatMap(round => round.attempts.map((attempt, index) => ({
      ...attempt, mode: round.mode, order: round.id + ':' + String(index).padStart(2, '0')
    }))).filter(attempt => questions.has(attempt.qid))
      .sort((a, b) => a.at - b.at || a.order.localeCompare(b.order));
    const byCategory = new Map();
    const lastSeen = new Map();
    const mistakes = new Map();
    let correct = 0;
    for (const attempt of attempts) {
      const question = questions.get(attempt.qid);
      const family = families.get(question.family);
      const stats = byCategory.get(family.category) || { total: 0, correct: 0 };
      stats.total++;
      lastSeen.set(question.id, attempt.at);
      const mistake = mistakes.get(family.id);
      if (attempt.correct) {
        correct++;
        stats.correct++;
        if (mistake && attempt.mode === 'review' && question.id !== mistake.first.qid && question.id !== mistake.last.qid) {
          mistake.passed.add(question.id);
          if (mistake.passed.size === 2) mistakes.delete(family.id);
        }
      } else {
        mistakes.set(family.id, {
          first: mistake ? mistake.first : attempt,
          last: attempt,
          misses: (mistake ? mistake.misses : 0) + 1,
          passed: new Set()
        });
      }
      byCategory.set(family.category, stats);
    }
    return { total: attempts.length, correct, byCategory, lastSeen, mistakes, families, questions };
  }

  function leastRecent(questions, lastSeen) {
    return questions.slice().sort((a, b) => (lastSeen.get(a.id) || 0) - (lastSeen.get(b.id) || 0));
  }

  function practiceQuestions(book, category, progress) {
    const eligible = book.families.filter(family => !category || family.category === category);
    const choices = eligible.map(family => leastRecent(family.questions, progress.lastSeen));
    return choices.map(questions => questions[0]).concat(category ? choices.map(questions => questions[1]) : []);
  }

  function reviewQuestions(progress, familyId) {
    return [...progress.mistakes.entries()]
      .filter(([id]) => !familyId || id === familyId)
      .sort((a, b) => b[1].misses - a[1].misses || b[1].last.at - a[1].last.at)
      .map(([id, mistake]) => {
        const eligible = progress.families.get(id).questions.filter(q =>
          q.id !== mistake.first.qid && q.id !== mistake.last.qid && !mistake.passed.has(q.id)
        );
        return leastRecent(eligible, progress.lastSeen)[0];
      }).filter(Boolean);
  }

  return { saveRound, loadRounds, judge, analyze, practiceQuestions, reviewQuestions };
});
