import type { LegalSection } from './types';

export type LegalDiffPart = {
  kind: 'unchanged' | 'removed' | 'added';
  text: string;
};
export type LegalSectionDiff = {
  id: string;
  title: string;
  kind: 'added' | 'removed' | 'revised' | 'unchanged';
  parts: LegalDiffPart[];
};

// Keep delimiters and whitespace so either side reconstructs the exact source.
function sentences(text: string): string[] {
  return (text.match(/[\s\S]*?(?:[.!?]+(?:\s+|$)|$)/gu) ?? []).filter(Boolean);
}
export function diffLegalText(before: string, after: string): LegalDiffPart[] {
  if (before === after) return [{ kind: 'unchanged', text: before }];
  if (!before) return [{ kind: 'added', text: after }];
  if (!after) return [{ kind: 'removed', text: before }];
  if (
    /^\s*(?:[*-] |\d+\. )/mu.test(before) ||
    /^\s*(?:[*-] |\d+\. )/mu.test(after)
  )
    return [
      { kind: 'removed', text: before },
      { kind: 'added', text: after },
    ];
  const a = sentences(before),
    b = sentences(after);
  const lengths = Array.from({ length: a.length + 1 }, () =>
    Array<number>(b.length + 1).fill(0)
  );
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      lengths[i]![j] =
        a[i] === b[j]
          ? 1 + lengths[i + 1]![j + 1]!
          : Math.max(lengths[i + 1]![j]!, lengths[i]![j + 1]!);
  const parts: LegalDiffPart[] = [];
  let i = 0,
    j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      parts.push({ kind: 'unchanged', text: a[i++]! });
      j++;
    } else if (
      i < a.length &&
      (j === b.length || lengths[i + 1]![j]! >= lengths[i]![j + 1]!)
    )
      parts.push({ kind: 'removed', text: a[i++]! });
    else parts.push({ kind: 'added', text: b[j++]! });
  }
  return parts;
}
export function diffLegalDocuments(
  before: readonly LegalSection[],
  after: readonly LegalSection[]
): LegalSectionDiff[] {
  const index = (sections: readonly LegalSection[]) =>
    new Map(
      sections.map((section) => {
        if (!section.id) throw new Error('Legal section needs a stable id');
        return [section.id, section];
      })
    );
  const old = index(before),
    next = index(after);
  return [...new Set([...old.keys(), ...next.keys()])].map((id) => {
    const a = old.get(id),
      b = next.get(id);
    return {
      id,
      title: (b ?? a)!.title,
      kind: !a
        ? 'added'
        : !b
          ? 'removed'
          : a.content === b.content
            ? 'unchanged'
            : 'revised',
      parts: diffLegalText(a?.content ?? '', b?.content ?? ''),
    };
  });
}
