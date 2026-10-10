// @vitest-environment jsdom
import type { LettinPublicWorld } from '@tuturuuu/internal-api/lettin';
import type { ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { PublicExplorer } from './public-explorer';
import { createStarterDraft } from './starter-drafts';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('@/i18n/navigation', () => ({
  Link: (props: ComponentProps<'a'>) => <a {...props} />,
}));
vi.mock('@tuturuuu/ui/input', () => ({
  Input: (props: ComponentProps<'input'>) => <input {...props} />,
}));
const draft = createStarterDraft('Published title', 'blank', (key) => key);
const world: LettinPublicWorld = {
  id: 'world',
  creatorId: 'creator',
  entries: [],
  published: {
    ...draft,
    tags: ['Rồng & lore', '<script>spoiler</script>', 'Rồng & lore'],
  },
};
function render(
  worlds: LettinPublicWorld[],
  options: { page?: number; search?: string; tag?: string } = {}
) {
  const container = document.createElement('div');
  container.innerHTML = renderToStaticMarkup(
    <PublicExplorer worlds={worlds} {...options} />
  );
  return container;
}
it('renders independent escaped tag links without nested anchors or duplicate tags', () => {
  const container = render([world]);
  const links = [...container.querySelectorAll('nav[aria-label=browseTags] a')];
  expect(links).toHaveLength(2);
  expect(links[0]?.textContent).toBe('Rồng & lore');
  expect(
    new URL(
      links[0]!.getAttribute('href')!,
      'https://lettin.tuturuuu.com'
    ).searchParams.get('tag')
  ).toBe('Rồng & lore');
  expect(container.querySelector('a a')).toBeNull();
  expect(container.querySelector('script')).toBeNull();
});
it('retains search and tag when paging and removing only the tag', () => {
  const container = render(
    Array.from({ length: 25 }, (_, index) => ({ ...world, id: String(index) })),
    { page: 2, search: 'magic & art', tag: 'Rồng & lore' }
  );
  expect(
    container.querySelector<HTMLInputElement>('input[name=tag]')?.value
  ).toBe('Rồng & lore');
  for (const label of ['previousPage', 'nextPage']) {
    const link = [...container.querySelectorAll('a')].find(
      (a) => a.textContent === label
    )!;
    const query = new URL(link.href).searchParams;
    expect(query.get('q')).toBe('magic & art');
    expect(query.get('tag')).toBe('Rồng & lore');
    expect(query.get('page')).toBe(label === 'previousPage' ? null : '3');
  }
  const clear = [...container.querySelectorAll('a')].find(
    (a) => a.textContent === 'clearTag'
  )!;
  const query = new URL(clear.href).searchParams;
  expect(query.get('q')).toBe('magic & art');
  expect(query.has('tag')).toBe(false);
  expect(query.has('page')).toBe(false);
  expect(container.querySelectorAll('article')).toHaveLength(24);
});
it('offers clear filters for an empty tag result rather than a notebook creation prompt', () => {
  const container = render([], { tag: 'missing' });
  expect(container.textContent).toContain('noResults');
  expect(container.textContent).toContain('clearFilters');
  expect(container.textContent).not.toContain('openNotebook');
});
it('keeps historical empty tags free of empty navigation', () => {
  expect(
    render([{ ...world, published: draft }]).querySelector(
      'nav[aria-label=browseTags]'
    )
  ).toBeNull();
});

it('keeps empty creator filters scoped and offers recovery for empty later pages', () => {
  for (const filters of [
    { search: 'no-match' },
    { tag: 'Magic' },
    { page: 3 },
  ]) {
    const host = document.createElement('div');
    host.innerHTML = renderToStaticMarkup(
      <PublicExplorer
        worlds={[]}
        clearHref="/creators/canonical-id"
        {...filters}
      />
    );
    expect(host.textContent).toContain('noResults');
    const clear = [...host.querySelectorAll('a')].find((link) =>
      link.textContent?.includes('clearFilters')
    )!;
    expect(clear.getAttribute('href')).toBe('/creators/canonical-id');
  }
  const global = render([], { page: 3 });
  expect(
    [...global.querySelectorAll('a')]
      .find((link) => link.textContent?.includes('clearFilters'))
      ?.getAttribute('href')
  ).toBe('/worlds');
});
