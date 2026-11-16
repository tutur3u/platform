import { cleanText, SHOWCASE_LIMITS } from './limits';
import type { ShowcaseCategory, ShowcaseProduct } from './catalog';

export type CatalogFilter = {
  query: string;
  category: ShowcaseCategory | 'all';
  interactiveOnly: boolean;
};

export const DEFAULT_CATALOG_FILTER: CatalogFilter = {
  query: '',
  category: 'all',
  interactiveOnly: false,
};

/** Case-insensitive match on title, slug and summary; interactive first. */
export function filterCatalog(
  products: readonly ShowcaseProduct[],
  filter: CatalogFilter
): ShowcaseProduct[] {
  const query = cleanText(
    filter.query,
    SHOWCASE_LIMITS.titleLength
  ).toLowerCase();
  return products
    .filter(
      (product) =>
        (filter.category === 'all' || product.category === filter.category) &&
        (!filter.interactiveOnly || product.interactive) &&
        (!query ||
          product.title.toLowerCase().includes(query) ||
          product.slug.includes(query) ||
          product.summary.toLowerCase().includes(query))
    )
    .sort((a, b) => Number(b.interactive) - Number(a.interactive));
}

export function isDefaultFilter(filter: CatalogFilter): boolean {
  return (
    !filter.query.trim() && filter.category === 'all' && !filter.interactiveOnly
  );
}
