const FIELD = /^\s*(from|từ|sent|date|đã gửi|ngày|to|đến|subject|chủ đề)\s*:/iu;
const FIELDS = [
  /^(?:from|từ)$/iu,
  /^(?:sent|date|đã gửi|ngày)$/iu,
  /^(?:to|đến)$/iu,
  /^(?:subject|chủ đề)$/iu,
];

export function hasOutlookHeaderLines(lines: string[], start = 0) {
  let expected = 0;
  for (let index = start; index < lines.length; index++) {
    const line = lines[index]!;
    if (!line.trim()) continue;
    const field = FIELD.exec(line)?.[1];
    if (!field) {
      if (expected === 0) return false;
      continue; // Folded values may occupy any number of lines.
    }
    if (!FIELDS[expected]!.test(field)) return false;
    expected++;
    if (expected === FIELDS.length) return true;
  }
  return false;
}

/** Normalize one time, recording element spans instead of cloning subtrees. */
export function findOutlookHistoryHeaders(body: HTMLElement) {
  const chunks: string[] = [];
  const ranges = new Map<Element, { start: number; end: number }>();
  let length = 0;
  let contentEnd = 0;
  const append = (text: string) => {
    chunks.push(text);
    length += text.length;
    if (text.trim()) contentEnd = length - text.length + text.trimEnd().length;
  };
  const stack: { node: Node; exit?: boolean }[] = [{ node: body }];
  while (stack.length) {
    const { node, exit } = stack.pop()!;
    if (node.nodeType === 3) {
      append(node.textContent ?? '');
      continue;
    }
    if (node.nodeType !== 1) continue;
    const element = node as Element;
    if (element.matches('script,style')) continue;
    if (exit) {
      if (element.matches('div,p,tr')) append('\n');
      const range = ranges.get(element)!;
      range.end = Math.max(range.start, contentEnd);
      continue;
    }
    if (
      element.tagName === 'BR' ||
      (element.matches('b,strong,span') &&
        element.children.length === 0 &&
        /^(?:from|từ|sent|date|đã gửi|ngày|to|đến|subject|chủ đề)\s*:\s*$/iu.test(
          element.textContent?.trim() ?? ''
        ))
    ) {
      append('\n');
    }
    ranges.set(element, { start: length, end: length });
    stack.push({ node, exit: true });
    for (let index = node.childNodes.length - 1; index >= 0; index--) {
      stack.push({ node: node.childNodes[index]! });
    }
  }
  const text = chunks.join('');
  const headers = new Set<Element>();
  const covered = new Set<Element>();
  const matches = new Map<string, boolean>();
  // Prefer the innermost complete header and skip its enclosing wrappers.
  for (const candidate of Array.from(
    body.querySelectorAll('div,p')
  ).reverse()) {
    if (covered.has(candidate)) continue;
    const range = ranges.get(candidate)!;
    const key = `${range.start}:${range.end}`;
    let match = matches.get(key);
    if (match === undefined) {
      const content = text.slice(range.start, range.end).trimStart();
      match =
        /^(?:from|từ)\s*:/iu.test(content) &&
        hasOutlookHeaderLines(content.split('\n'));
      matches.set(key, match);
    }
    if (!match) continue;
    headers.add(candidate);
    for (
      let parent = candidate.parentElement;
      parent;
      parent = parent.parentElement
    )
      covered.add(parent);
  }
  return headers;
}
