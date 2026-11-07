(function () {
  'use strict';

  const { books, categories } = window.CnmPracticeBank;
  const engine = window.CnmPractice;
  const view = document.getElementById('practice-view');
  const setup = document.getElementById('practice-setup');
  const bookSelect = document.getElementById('practice-book');
  const profileSelect = document.getElementById('practice-profile');
  const storageNote = document.getElementById('storage-note');
  const modeLabels = { mixed: '综合练习', review: '同类巩固', original: '原题重做' };
  const localProfile = 'local';
  const unsaved = new Map();
  let session = null;

  function el(tag, text, className) {
    const node = document.createElement(tag);
    if (text != null) node.textContent = text;
    if (className) node.className = className;
    return node;
  }

  function button(label, action, primary = false) {
    const node = el('button', label, primary ? 'primary' : '');
    node.type = 'button';
    node.addEventListener('click', action);
    return node;
  }

  function panel(title) {
    const node = el('section', null, 'practice-panel');
    const heading = el('h2', title);
    heading.tabIndex = -1;
    node.append(heading);
    return node;
  }

  function actions(...children) {
    const node = el('div', null, 'practice-actions');
    node.append(...children);
    return node;
  }

  function selectedBook() {
    return books.find(book => book.id === bookSelect.value);
  }

  function updateStorageNote(unreadable = false) {
    storageNote.hidden = !unreadable && !unsaved.size;
    storageNote.textContent = '浏览器存储不可用或空间不足。本页仍可练习，未保存的记录只在本页有效。';
  }

  function read(book, profile) {
    let rounds = [];
    let unreadable = false;
    try {
      rounds = engine.loadRounds(localStorage, profile, book.id);
    } catch (e) {
      unreadable = true;
    }
    const all = new Map(rounds.map(round => [round.id, round]));
    for (const item of unsaved.values()) {
      if (item.book === book && item.profile === profile) all.set(item.round.id, item.round);
    }
    updateStorageNote(unreadable);
    return [...all.values()].sort((a, b) => b.startedAt - a.startedAt);
  }

  function accuracy({ total, correct }) {
    return total ? `答对 ${correct}/${total}（${Math.round(100 * correct / total)}%）` : '还未作答';
  }

  function modeLabel(mode) {
    return modeLabels[mode] || categories.find(category => category.id === mode)?.label || '专项练习';
  }

  function showDashboard(focus = false) {
    session = null;
    setup.hidden = false;
    const book = selectedBook();
    const rounds = read(book, profileSelect.value);
    const progress = engine.analyze(book, rounds);
    const practice = panel('开始练习');
    const questionCount = book.families.reduce((sum, family) => sum + family.questions.length, 0);
    practice.append(
      el('p', `${book.families.length} 类计算方法，共 ${questionCount} 道题。每题提交后查看答案和步骤。`, 'practice-muted'),
      actions(button(`综合练习 · ${book.families.length} 题`, () => start('mixed'), true))
    );
    const grid = el('div', null, 'practice-grid');
    for (const category of categories) {
      const families = book.families.filter(family => family.category === category.id);
      if (!families.length) continue;
      const card = el('section', null, 'practice-category');
      const stats = progress.byCategory.get(category.id) || { total: 0, correct: 0 };
      const pending = families.filter(family => progress.mistakes.has(family.id)).length;
      card.append(
        el('h3', category.label),
        el('p', families.map(family => family.label).join('、'), 'practice-muted'),
        el('p', `${accuracy(stats)} · 待巩固 ${pending} 类`),
        actions(button(`练${category.label} · ${families.length * 2} 题`, () => start(category.id)))
      );
      grid.append(card);
    }
    practice.append(grid);

    const mistakes = panel('错题巩固');
    if (!progress.mistakes.size) {
      mistakes.append(el('p', '目前没有待巩固题型。答错的题会按计算方法归到这里。', 'practice-muted'));
    } else {
      mistakes.append(
        el('p', `待巩固 ${progress.mistakes.size} 类。每类连续做对两道不同变式后移出，答错会重新累计。`),
        actions(button('开始同类巩固', () => start('review'), true))
      );
      const list = el('div', null, 'practice-grid');
      for (const [id, mistake] of progress.mistakes) {
        const family = progress.families.get(id);
        const question = progress.questions.get(mistake.last.qid);
        const card = el('article', null, 'practice-mistake');
        const link = el('a', '相关知识点');
        link.href = '../explore/#' + encodeURIComponent(family.topicId);
        const related = el('p', null, 'practice-muted');
        related.append(link);
        card.append(
          el('h3', family.label),
          el('p', question.prompt, 'practice-prompt'),
          el('p', `最近作答 ${mistake.last.inputs.join('，')} · 答错 ${mistake.misses} 次 · 变式 ${mistake.passed.size}/2`),
          related,
          actions(button('重做最近错题', () => start('original', id)), button('练这一类', () => start('review', id)))
        );
        list.append(card);
      }
      mistakes.append(list);
    }

    const history = panel('练习记录');
    history.append(el('p', `累计 ${progress.total} 题次 · ${accuracy(progress)}`, 'practice-stats'));
    if (rounds.length) history.append(el('p', '最近 8 轮，展开可查看每题的作答和参考答案。', 'practice-muted'));
    for (const round of rounds.slice(0, 8)) {
      const detail = el('details');
      const stats = { total: round.attempts.length, correct: round.attempts.filter(attempt => attempt.correct).length };
      detail.append(el('summary', `${new Date(round.startedAt).toLocaleString('zh-CN')} · ${modeLabel(round.mode)} · ${accuracy(stats)} · 已做 ${stats.total}/${round.size}`));
      const list = el('ol');
      for (const attempt of round.attempts) {
        const question = progress.questions.get(attempt.qid);
        if (!question) continue;
        const item = el('li', question.prompt);
        item.append(el('p', `${attempt.correct ? '答对' : '答错'} · 作答 ${attempt.inputs.join('，')} · 参考答案 ${question.displayAnswer}`));
        list.append(item);
      }
      detail.append(list);
      history.append(detail);
    }
    view.replaceChildren(practice, mistakes, history);
    if (focus) practice.firstChild.focus();
  }

  function start(mode, familyId) {
    const book = selectedBook();
    const profile = profileSelect.value;
    const progress = engine.analyze(book, read(book, profile));
    let questions;
    if (mode === 'review') questions = engine.reviewQuestions(progress, familyId);
    else if (mode === 'original') {
      const mistake = progress.mistakes.get(familyId);
      questions = mistake ? [progress.questions.get(mistake.last.qid)] : [];
    } else questions = engine.practiceQuestions(book, mode === 'mixed' ? null : mode, progress);
    if (!questions.length) return showDashboard(true);

    const startedAt = Date.now();
    const nonce = Array.from(crypto.getRandomValues(new Uint32Array(2)), value => value.toString(36)).join('-');
    const round = { id: startedAt + '-' + nonce, startedAt, mode, size: questions.length, attempts: [] };
    session = { book, profile, round, questions, index: 0 };
    setup.hidden = true;
    showQuestion();
  }

  function persist(active) {
    const { book, profile, round } = active;
    try {
      engine.saveRound(localStorage, profile, book.id, round);
      unsaved.delete(round.id);
    } catch (e) {
      unsaved.set(round.id, active);
    }
    updateStorageNote();
  }

  function showQuestion() {
    const active = session;
    const { questions, index, round } = active;
    const question = questions[index];
    const section = panel(`${modeLabel(round.mode)} · 第 ${index + 1}/${questions.length} 题`);
    section.append(el('p', question.prompt, 'practice-prompt'));
    const form = el('form');
    const isAlgebra = !question.fields && question.answers.length === 2;
    const fieldSpecs = question.fields || (isAlgebra ? [{ label: 'x 的系数' }, { label: '常数项' }] : [{ label: '计算结果' }]);
    const hasOptions = fieldSpecs.some(field => field.options);
    const hint = el('p', isAlgebra
      ? '化简成 ax + b 后分别填写两个数，某一项没有就填 0。'
      : (hasOptions ? '先选择关系符号，再填写各数值。' : '按下方标签填写结果。') +
        '数值可输入整数、小数或分数（例如 -3/4）。', 'practice-muted');
    hint.id = 'answer-hint';
    const fields = el('div', null, 'practice-fields');
    const inputs = fieldSpecs.map(({ label: text, options }) => {
      const label = el('label', text);
      const input = el(options ? 'select' : 'input');
      if (options) input.append(new Option('请选择', ''), ...options.map(value => new Option(value, value)));
      else {
        input.type = 'text';
        input.autocomplete = 'off';
        input.maxLength = 50;
      }
      input.setAttribute('aria-describedby', 'answer-hint');
      label.append(input);
      fields.append(label);
      return input;
    });
    const error = el('p', hasOptions
      ? '请选择所有关系符号，并填写有效的数值。'
      : '请在每个答题框中填写有效的整数、小数或分数。', 'practice-error');
    error.setAttribute('role', 'alert');
    error.hidden = true;
    const submit = el('button', '提交答案', 'primary');
    submit.type = 'submit';
    const back = button('结束本轮', () => round.attempts.length ? showResult() : showDashboard(true));
    const controls = actions(submit, back);
    form.append(hint, fields, error, controls);
    section.append(form);

    form.addEventListener('submit', event => {
      event.preventDefault();
      if (submit.disabled) return;
      const values = inputs.map(input => input.value.trim());
      const correct = engine.judge(question, values);
      error.hidden = correct !== null;
      if (correct === null) return;
      round.attempts.push({ qid: question.id, at: Date.now(), inputs: values, correct });
      persist(active);
      submit.disabled = true;
      submit.hidden = true;
      inputs.forEach(input => {
        if (input.tagName === 'SELECT') input.disabled = true;
        else input.readOnly = true;
      });
      const feedback = el('div', null, 'practice-feedback' + (correct ? ' is-correct' : ''));
      feedback.setAttribute('role', 'status');
      feedback.append(
        el('p', correct ? '答对了' : '这题答错了，已列入错题巩固。', 'practice-stats'),
        el('p', '参考答案　' + question.displayAnswer),
        el('p', question.explanation)
      );
      form.insertBefore(feedback, controls);
      const last = index + 1 === questions.length;
      const next = button(last ? '查看本轮结果' : '下一题', () => {
        if (last) showResult();
        else {
          active.index++;
          showQuestion();
        }
      }, true);
      controls.prepend(next);
      back.hidden = last;
      next.focus();
    });
    view.replaceChildren(section);
    section.firstChild.focus();
  }

  function showResult() {
    const { book, profile, round } = session;
    const progress = engine.analyze(book, read(book, profile));
    const result = panel('本轮结果');
    const stats = { total: round.attempts.length, correct: round.attempts.filter(attempt => attempt.correct).length };
    result.append(
      el('p', `${modeLabel(round.mode)} · 已做 ${stats.total}/${round.size} · ${accuracy(stats)}`, 'practice-stats'),
      el('p', `当前还有 ${progress.mistakes.size} 类待巩固。`, 'practice-muted')
    );
    const back = button('返回练习首页', () => showDashboard(true), !progress.mistakes.size);
    const controls = actions(back);
    if (progress.mistakes.size) controls.prepend(button('继续同类巩固', () => start('review'), true));
    result.append(controls);
    view.replaceChildren(result);
    result.firstChild.focus();
  }

  for (const book of books) bookSelect.add(new Option(book.label, book.id));
  profileSelect.add(new Option('本机练习', localProfile));
  for (const child of window.CnmChildren.list()) {
    profileSelect.add(new Option(`${child.name} · ${child.grade}`, child.id));
  }
  profileSelect.value = window.CnmChildren.current()?.id || localProfile;
  bookSelect.addEventListener('change', () => showDashboard());
  profileSelect.addEventListener('change', () => showDashboard());
  showDashboard();
})();
