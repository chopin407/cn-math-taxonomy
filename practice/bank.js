/* 计算专项独立题库。题型、变式编号用于关联历史记录，增补时不要改用已有编号。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CnmPracticeBank = factory();
})(typeof self === 'undefined' ? this : self, function () {
  'use strict';

  const categories = [
    { id: 'pitfalls', label: '易错题', description: '负号、乘方顺序、分数除法' },
    { id: 'brackets', label: '去括号', description: '括号前有负号、乘数或嵌套括号' },
    { id: 'simplify', label: '简便运算', description: '凑整、分组、分配律' },
    { id: 'tricks', label: '技巧题', description: '裂项抵消、整体代入、分母方程' }
  ];

  const number = (prompt, answer, explanation) => ({
    prompt, answers: [String(answer)], displayAnswer: String(answer), explanation
  });
  const signed = n => n < 0 ? ' − ' + (-n) : ' + ' + n;
  function fraction(n, d) {
    let a = n, b = d;
    while (b) [a, b] = [b, a % b];
    return d === a ? String(n / a) : `${n / a}/${d / a}`;
  }
  const linear = (a, b) => a === 0 ? String(b) : (a === 1 ? 'x' : a === -1 ? '−x' : a + 'x') + (b ? signed(b) : '');
  const algebra = (expression, a, b, explanation) => ({
    prompt: '去括号并合并同类项：' + expression,
    answers: [String(a), String(b)], displayAnswer: linear(a, b), explanation
  });

  const families = [];
  function family(id, category, label, topicId, params, build) {
    families.push({
      id, category, label, topicId,
      questions: params.map((args, i) => ({ id: id + '-' + (i + 1), family: id, ...build(...args) }))
    });
  }

  family('subtract-negative', 'pitfalls', '减去负数', 'cnm_013',
    [[8, 3, 7], [6, 4, 1], [9, 5, 8], [7, 2, 10]],
    (a, b, c) => number(`计算：−${a} − (−${b}) + ${c}`, -a + b + c,
      `减去负数等于加上它的相反数。原式 = −${a} + ${b} + ${c} = ${-a + b + c}。`));

  family('power-sign', 'pitfalls', '乘方与负号', 'cnm_021',
    [[3, 2], [2, 5], [4, 3], [5, 4]],
    (a, b) => number(`计算：−${a}² + (−${b})²`, -a * a + b * b,
      `第一项先平方再取相反数，第二项的底数是负数。原式 = −${a * a} + ${b * b} = ${-a * a + b * b}。`));

  family('divide-fraction', 'pitfalls', '分数除法与符号', 'cnm_017',
    [[3, 4, 9, 2], [2, 5, 4, 3], [5, 6, 10, 3], [7, 8, 21, 2]],
    (a, b, c, d) => number(`计算：(−${a}/${b}) ÷ (−${c}/${d})`, fraction(a * d, b * c),
      `除以一个非零数，等于乘它的倒数。两负相乘得正，原式 = (${a}/${b}) × (${d}/${c})。`));

  family('minus-brackets', 'brackets', '括号前的负号', 'cnm_035',
    [[3, 5, 4], [4, 2, 6], [5, 7, 3], [6, 9, 2]],
    (a, b, c) => algebra(`${a}x − (${b}x − ${c})`, a - b, c,
      `括号前是减号，括号内两项都要变号。原式 = ${a}x − ${b}x + ${c} = ${linear(a - b, c)}。`));

  family('multiply-brackets', 'brackets', '括号前的负系数', 'cnm_036',
    [[2, 3, 4, 5], [3, 2, 5, 4], [4, 3, 2, 7], [5, 2, 3, 10]],
    (a, b, c, d) => algebra(`${d}x − ${a}(${b}x − ${c})`, d - a * b, a * c,
      `用 −${a} 分别乘括号内的两项。原式 = ${d}x − ${a * b}x + ${a * c} = ${linear(d - a * b, a * c)}。`));

  family('nested-brackets', 'brackets', '多层括号', 'cnm_035',
    [[4, 3, 2, 5], [5, 2, 6, 3], [2, 7, 4, 8], [6, 4, 3, 2]],
    (a, b, c, d) => algebra(`${a}x − [${b} − (${c}x − ${d})]`, a + c, -b - d,
      `先去内层括号，中括号内变为 ${b} − ${c}x + ${d}。再去中括号，原式 = ${a}x − ${b} + ${c}x − ${d} = ${linear(a + c, -b - d)}。`));

  family('group-sums', 'simplify', '加减凑整', 'cnm_011',
    [[37, 16, 21], [48, 23, 31], [24, 45, 52], [64, 32, 46]],
    (a, b, c) => number(`计算：${a} − ${b} + ${100 - a} − ${c}`, 100 - b - c,
      `把加数重排分组。原式 = (${a} + ${100 - a}) − (${b} + ${c}) = 100 − ${b + c} = ${100 - b - c}。`));

  family('group-factors', 'simplify', '乘法凑整', 'cnm_015',
    [[25, 4, 7], [125, 8, 3], [50, 2, 9], [5, 20, 6]],
    (a, b, c) => number(`计算：(−${a}) × ${c} × ${b}`, -a * b * c,
      `交换后先算能凑整的一组。原式 = [(−${a}) × ${b}] × ${c} = −${a * b} × ${c} = ${-a * b * c}。`));

  family('distribute', 'simplify', '乘法分配律', 'cnm_015',
    [[24, 4, 8, 3], [36, 6, 12, 4], [30, 5, 10, 6], [48, 8, 12, 6]],
    (m, a, b, c) => number(`计算：${m} × (1/${a} − 1/${b} + 1/${c})`, m / a - m / b + m / c,
      `分别用 ${m} 乘括号内的每一项。原式 = ${m / a} − ${m / b} + ${m / c} = ${m / a - m / b + m / c}。`));

  family('telescoping', 'tricks', '裂项抵消', 'cnm_013',
    [[2, 5], [3, 8], [4, 9], [5, 12]],
    (a, b) => {
      const terms = Array.from({ length: b - a }, (_, i) => `1/(${a + i}×${a + i + 1})`);
      return number('计算：' + terms.join(' + '), fraction(b - a, a * b),
        `把每项拆成 1/n − 1/(n+1)。例如 ${terms[0]} = 1/${a} − 1/${a + 1}。中间项逐一抵消，只剩 1/${a} − 1/${b}。`);
    });

  family('substitute-whole', 'tricks', '整体代入', 'cnm_029',
    [[2, 3, 5, 4, 7], [3, 2, 4, 5, 6], [4, 5, 3, 2, 8], [5, 4, 2, 3, 9]],
    (a, b, c, m, d) => number(`已知 ${a}x − ${b}y = ${c}，求 ${m * a}x − ${m * b}y + ${d} 的值。`, m * c + d,
      `把已知式当成一个整体。所求式 = ${m}(${a}x − ${b}y) + ${d} = ${m} × ${c} + ${d} = ${m * c + d}。`));

  family('equation-denominators', 'tricks', '先合并再去分母', 'cnm_044',
    [[1, 3, 6, 5], [2, 4, 8, 3], [3, 5, 10, 4], [4, 6, 12, 5]],
    (a, b, c, d) => number(`解方程：(x − ${a})/${b} + (x − ${a})/${c} = ${d}`, fraction(3 * a + c * d, 3),
      `左边提取 (x − ${a})，合并后得到 3(x − ${a})/${c} = ${d}。两边乘 ${c}，得 3(x − ${a}) = ${c * d}，再解得 x。`));

  return { categories, books: [{ id: 'pep-7a', label: '七年级上册 · 人教版', families }] };
});
