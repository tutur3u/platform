import type { DocumentOutlineItem } from './document-outline-model';
export const outlineSearchLimit = 100;
export function filterOutlineItems(
  items: DocumentOutlineItem[],
  search: string
) {
  const query = search
    .slice(0, outlineSearchLimit)
    .trim()
    .normalize('NFKC')
    .toLowerCase();
  return query
    ? items.filter((item) =>
        item.label.normalize('NFKC').toLowerCase().includes(query)
      )
    : items;
}
