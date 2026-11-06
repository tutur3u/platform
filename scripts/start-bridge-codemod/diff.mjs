// Minimal unified diff for dry-run output (LCS over lines, 3 lines context).

function lcsTable(a, b) {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const table = new Uint32Array(rows * cols);
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      table[i * cols + j] =
        a[i] === b[j]
          ? table[(i + 1) * cols + j + 1] + 1
          : Math.max(table[(i + 1) * cols + j], table[i * cols + j + 1]);
  return { table, cols };
}

function edits(a, b) {
  const { table, cols } = lcsTable(a, b);
  const result = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      result.push({ type: ' ', line: a[i], i, j });
      i++;
      j++;
    } else if (table[(i + 1) * cols + j] >= table[i * cols + j + 1]) {
      result.push({ type: '-', line: a[i], i, j });
      i++;
    } else {
      result.push({ type: '+', line: b[j], i, j });
      j++;
    }
  }
  while (i < a.length) result.push({ type: '-', line: a[i], i: i++, j });
  while (j < b.length) result.push({ type: '+', line: b[j], i, j: j++ });
  return result;
}

const lines = (text) =>
  text === null || text === '' ? [] : text.replace(/\n$/u, '').split('\n');

export function unifiedDiff(path, before, after, context = 3) {
  if (before === after) return '';
  const script = edits(lines(before), lines(after));
  const changed = script
    .map((edit, index) => (edit.type === ' ' ? -1 : index))
    .filter((index) => index !== -1);
  const hunks = [];
  for (const index of changed) {
    const start = Math.max(0, index - context);
    const end = Math.min(script.length, index + context + 1);
    const last = hunks.at(-1);
    if (last && start <= last.end) last.end = Math.max(last.end, end);
    else hunks.push({ start, end });
  }
  const out = [
    `--- ${before === null ? '/dev/null' : `a/${path}`}`,
    `+++ ${after === null ? '/dev/null' : `b/${path}`}`,
  ];
  for (const { start, end } of hunks) {
    const slice = script.slice(start, end);
    const oldStart = slice[0].i;
    const newStart = slice[0].j;
    const oldCount = slice.filter((edit) => edit.type !== '+').length;
    const newCount = slice.filter((edit) => edit.type !== '-').length;
    out.push(
      `@@ -${oldCount === 0 ? oldStart : oldStart + 1},${oldCount} +${newCount === 0 ? newStart : newStart + 1},${newCount} @@`
    );
    for (const edit of slice) out.push(`${edit.type}${edit.line}`);
  }
  return `${out.join('\n')}\n`;
}
