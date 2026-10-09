import type { LettinNode } from '@tuturuuu/internal-api/lettin';
export const outlineLimit = 100;
export type DocumentOutlineItem = { id: string; label: string; level: number };
export function buildDocumentOutline(root: LettinNode, scope: string) {
  const prefix = /^[a-z][a-z0-9_-]{0,120}$/i.test(scope)
    ? scope
    : 'lettin-document';
  const items: DocumentOutlineItem[] = [],
    ids = new Map<string, string>();
  let total = 0;
  const text = (node: LettinNode, depth: number): string => {
    if (depth > 25) return '';
    if (node.type === 'text') return node.text ?? '';
    if (node.type === 'hardBreak') return ' ';
    if (['image', 'imageResize', 'horizontalRule'].includes(node.type))
      return '';
    return (node.content ?? []).map((child) => text(child, depth + 1)).join('');
  };
  const visit = (node: LettinNode, path: string, depth: number): void => {
    if (depth > 25) return;
    if (node.type === 'heading') {
      const label = text(node, depth).replace(/\s+/g, ' ').trim();
      if (label) {
        total++;
        if (items.length < outlineLimit) {
          const id = `${prefix}-section-${path.replaceAll('.', '-')}`;
          const rawLevel = Number(node.attrs?.level),
            level = [1, 2, 3, 4, 5, 6].includes(rawLevel) ? rawLevel : 2;
          items.push({
            id,
            label: label.length > 160 ? `${label.slice(0, 159)}…` : label,
            level,
          });
          ids.set(path, id);
        }
      }
    }
    // Match rendered children: these leaf renderers ignore nested content.
    if (
      ['text', 'image', 'imageResize', 'hardBreak', 'horizontalRule'].includes(
        node.type
      )
    )
      return;
    node.content?.forEach((child, index) => {
      visit(child, `${path}.${index}`, depth + 1);
    });
  };
  visit(root, '0', 0);
  return { items, ids, total, truncated: total > outlineLimit };
}
