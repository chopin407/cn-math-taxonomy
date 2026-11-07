(async function () {
  'use strict';

  const $ = id => document.getElementById('grade7-' + id);
  const [profile, volume, chapter, unit, kind, difficulty, search, wrong] =
    ['profile', 'volume', 'chapter', 'unit', 'kind', 'difficulty', 'search', 'wrong'].map($);
  const pageSize = 24;
  const storagePrefix = 'cnmGrade7.results.v1:';
  const unsaved = new Map();
  let chapters, kinds, catalog;
  let page = 0;
  let records = new Map();

  function el(tag, text, className) {
    const node = document.createElement(tag);
    if (text != null) node.textContent = text;
    if (className) node.className = className;
    return node;
  }

  function richText(tag, text, className) {
    const node = el(tag, null, className);
    text.split(/(\*[^*\n]+\*)/).forEach((part, index) => {
      node.append(index % 2 ? el('strong', part.slice(1, -1)) : part);
    });
    return node;
  }

  function recordKey(id) {
    return storagePrefix + encodeURIComponent(profile.value) + ':' + id;
  }

  function readRecords() {
    records = new Map();
    $('storage-note').hidden = !unsaved.size;
    try {
      for (const { question } of catalog) {
        const key = recordKey(question.id);
        const value = unsaved.get(key) ?? localStorage.getItem(key);
        if (value === '1' || value === '0') records.set(question.id, value === '1');
      }
    } catch (error) {
      $('storage-note').hidden = false;
    }
  }

  function saveResult(id, correct) {
    const value = correct ? '1' : '0';
    const key = recordKey(id);
    records.set(id, correct);
    try {
      localStorage.setItem(key, value);
      unsaved.delete(key);
      $('storage-note').hidden = !unsaved.size;
    } catch (error) {
      unsaved.set(key, value);
      $('storage-note').hidden = false;
    }
    showProgress();
  }

  function showProgress() {
    const pending = [...records.values()].filter(correct => !correct).length;
    $('progress').textContent = `已自评 ${records.size}/${catalog.length} 道 · 最近做对 ${records.size - pending} 道 · 待重做 ${pending} 道`;
  }

  function options(select, label, list) {
    const current = select.value;
    select.replaceChildren(new Option(label, ''), ...list.map(row => new Option(row.title, row.id)));
    if (list.some(row => row.id === current)) select.value = current;
  }

  function updateChapters() {
    options(chapter, '全部章节', chapters.filter(row => !volume.value || row.volume === volume.value));
  }

  function updateUnits() {
    const matching = chapters.filter(row =>
      (!volume.value || row.volume === volume.value) && (!chapter.value || row.id === chapter.value)
    );
    options(unit, '全部小节', matching.flatMap(row => row.units));
  }

  function matches(row, keywords) {
    const { chapter: book, unit: lesson, question } = row;
    return (!volume.value || book.volume === volume.value)
      && (!chapter.value || book.id === chapter.value)
      && (!unit.value || lesson.id === unit.value)
      && (!kind.value || question.kind === kind.value)
      && (!difficulty.value || question.difficulty === difficulty.value)
      && (!wrong.checked || records.get(question.id) === false)
      && keywords.every(word => row.searchText.includes(word));
  }

  function status(id) {
    const record = records.get(id);
    if (record === undefined) return '未自评';
    return record ? '最近做对' : '待重做';
  }

  function renderQuestion(question) {
    const detail = el('details', null, 'grade7-question');
    const summary = el('summary');
    const state = el('span', status(question.id));
    const labels = [kinds[question.kind], question.difficulty, question.sourceLabel].filter(Boolean);
    const metadata = el('span', labels.join(' · ') + ' · ', 'practice-muted');
    metadata.append(state);
    summary.append(metadata, richText('span', question.prompt, 'practice-prompt'));

    const solution = el('div', null, 'grade7-solution');
    if (question.reviewNote) {
      solution.append(el('p', '核对提示 · ' + question.reviewNote, 'practice-feedback'));
    }
    const steps = el('ol');
    steps.append(...question.steps.map(step => richText('li', step)));
    solution.append(el('p', '原资料详解', 'practice-stats'), steps);
    if (question.tip) solution.append(richText('p', '易错提醒 · ' + question.tip, 'practice-muted'));

    const actions = el('div', null, 'practice-actions');
    const feedback = el('p', '', 'practice-stats');
    feedback.setAttribute('role', 'status');
    const scores = [[true, '我做对了'], [false, '加入错题']].map(([correct, label]) => {
      const button = el('button', label, correct ? 'primary' : '');
      button.type = 'button';
      button.addEventListener('click', () => {
        saveResult(question.id, correct);
        if (wrong.checked && correct) {
          render(true);
          return;
        }
        state.textContent = status(question.id);
        feedback.textContent = correct ? '已记录为做对。' : '已加入错题，稍后可筛选重做。';
        actions.hidden = true;
        summary.focus();
      });
      return button;
    });
    actions.append(...scores);
    detail.addEventListener('toggle', () => {
      if (!detail.open) {
        actions.hidden = false;
        feedback.textContent = '';
      }
    });
    detail.append(summary, solution, actions, feedback);
    return detail;
  }

  function renderUnit(row) {
    const section = el('section', null, 'grade7-unit');
    const links = el('div', null, 'grade7-links');
    for (const topic of row.unit.topics) {
      const link = el('a', topic.name);
      link.href = '../explore/#' + encodeURIComponent(topic.id);
      links.append(link);
    }
    section.append(
      el('p', row.chapter.volume + ' · ' + row.chapter.title, 'practice-muted'),
      el('h3', row.unit.title),
      links
    );
    return section;
  }

  function render(focus = false) {
    const keywords = search.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const filtered = catalog.filter(row => matches(row, keywords));
    const pageCount = Math.ceil(filtered.length / pageSize);
    page = Math.max(0, Math.min(page, pageCount - 1));
    const start = page * pageSize;
    const results = $('results');
    results.replaceChildren();
    $('count').textContent = filtered.length
      ? `找到 ${filtered.length} 道 · 显示第 ${start + 1}–${Math.min(start + pageSize, filtered.length)} 道 · 第 ${page + 1}/${pageCount} 页`
      : '没有符合当前筛选的题目。';
    $('pages').hidden = pageCount < 2;
    $('prev').disabled = page === 0;
    $('next').disabled = page + 1 >= pageCount;
    let lastUnit, section;
    for (const row of filtered.slice(start, start + pageSize)) {
      if (lastUnit !== row.unit) {
        lastUnit = row.unit;
        section = renderUnit(row);
        results.append(section);
      }
      section.append(renderQuestion(row.question));
    }
    if (focus) $('results-title').focus();
  }

  try {
    const response = await fetch('../data/grade7-questions.json');
    if (!response.ok) throw new Error('HTTP ' + response.status);
    ({ chapters, kinds } = await response.json());
    catalog = chapters.flatMap(chapter => chapter.units.flatMap(unit => unit.questions.map(question => ({
      chapter, unit, question,
      searchText: [chapter.title, unit.title, question.prompt, question.sourceLabel].join(' ').replace(/\*/g, '').toLowerCase()
    }))));
  } catch (error) {
    $('count').textContent = '题库加载失败，请刷新页面后重试。';
    return;
  }

  $('intro').textContent += ` · ${chapters.length} 章 · ${chapters.reduce((n, row) => n + row.units.length, 0)} 节 · ${catalog.length} 道题`;
  for (const child of window.CnmChildren.list()) profile.add(new Option(`${child.name} · ${child.grade}`, child.id));
  profile.value = window.CnmChildren.current()?.id || 'local';
  for (const [id, name] of Object.entries(kinds)) kind.add(new Option(name, id));
  const topicId = new URLSearchParams(location.search).get('topic');
  const related = topicId && catalog.find(row => row.unit.topics.some(topic => topic.id === topicId));
  if (related) volume.value = related.chapter.volume;
  updateChapters();
  if (related) chapter.value = related.chapter.id;
  updateUnits();
  if (related) unit.value = related.unit.id;
  readRecords();
  showProgress();
  $('controls').hidden = false;
  render();

  function resetPage() {
    page = 0;
    render();
  }

  profile.addEventListener('change', () => {
    readRecords();
    showProgress();
    resetPage();
  });
  volume.addEventListener('change', () => {
    updateChapters();
    updateUnits();
    resetPage();
  });
  chapter.addEventListener('change', () => {
    updateUnits();
    resetPage();
  });
  for (const control of [unit, kind, difficulty, wrong]) control.addEventListener('change', resetPage);
  search.addEventListener('input', resetPage);
  $('prev').addEventListener('click', () => { page--; render(true); });
  $('next').addEventListener('click', () => { page++; render(true); });
})();
