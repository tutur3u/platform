import { expect, it } from 'vitest';
import { publicCatalogueFiltersSchema } from './public-catalogue-filters';

it('preserves Unicode and punctuation while bounding exact tags', () => {
  expect(
    publicCatalogueFiltersSchema.parse({ tag: '  Rồng & lore  ' })
  ).toMatchObject({ page: 1, tag: 'Rồng & lore' });
  expect(
    publicCatalogueFiltersSchema.safeParse({ tag: 'x'.repeat(40) }).success
  ).toBe(true);
});
it.each(['', '   ', 'x'.repeat(41), ['one', 'two']])(
  'rejects invalid tags %j',
  (tag) => {
    expect(publicCatalogueFiltersSchema.safeParse({ tag }).success).toBe(false);
  }
);
it('keeps catalogue inputs bounded and historical unfiltered queries compatible', () => {
  expect(publicCatalogueFiltersSchema.parse({})).toEqual({ page: 1 });
  expect(
    publicCatalogueFiltersSchema.safeParse({ search: 'x'.repeat(201) }).success
  ).toBe(false);
  expect(publicCatalogueFiltersSchema.safeParse({ page: 10001 }).success).toBe(
    false
  );
});
