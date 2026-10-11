// @vitest-environment jsdom
import type { LettinOverview, LettinRole } from '@tuturuuu/internal-api/lettin';
import { act, type ComponentProps } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import en from '../../messages/en.json';
import vietnamese from '../../messages/vi.json';
import { matchesStudioArtwork } from './studio-artwork-filter';
import { WorldShelf } from './world-shelf';

const state = vi.hoisted(() => ({ locale: 'en' }));
vi.mock('next-intl', () => ({
  useLocale: () => state.locale,
  useTranslations: () => (key: string) =>
    (state.locale === 'vi' ? vietnamese : en).lettin[
      key as keyof typeof en.lettin
    ],
}));
vi.mock('@/i18n/navigation', () => ({
  Link: (props: ComponentProps<'a'>) => <a {...props} />,
}));
vi.mock('@tuturuuu/ui/button', () => ({
  Button: ({
    variant: _variant,
    ...props
  }: ComponentProps<'button'> & {
    variant?: string;
  }) => <button {...props} />,
}));
vi.mock('@tuturuuu/ui/input', () => ({
  Input: (props: ComponentProps<'input'>) => <input {...props} />,
}));
vi.mock('./content-notice', () => ({ ContentNotice: () => null }));
const world = (
  id: string,
  role: LettinRole,
  published = false,
  tags = ['test']
) => ({
  id,
  role,
  version: 1,
  published_at: published ? '2026-10-10' : null,
  published: null,
  draft: {
    title: id,
    description: '',
    kind: 'world' as const,
    image: '',
    credit: '',
    tags,
    links: [],
    content: { type: 'doc' },
  },
});
const shelf = [
  world('Owned draft', 'owner'),
  world('Owned published', 'owner', true),
  world('Shared editor', 'editor'),
  world('Shared publisher', 'publisher', true),
];
const container = document.createElement('div');
const root = createRoot(container);
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
afterEach(async () => {
  await act(() => root.render(null));
  state.locale = 'en';
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
async function render(
  worlds: LettinOverview['worlds'] = shelf,
  wsId = 'workspace-a'
) {
  await act(() => root.render(<WorldShelf shelf={worlds} wsId={wsId} />));
}
const titles = () =>
  [...container.querySelectorAll('h2')].map((el) => el.textContent);
async function click(label: string) {
  const button = [...container.querySelectorAll('button')].find(
    (el) => el.textContent === label
  );
  expect(button).toBeDefined();
  await act(() => button!.click());
}
async function search(value: string) {
  const input = container.querySelector('input')!;
  await act(() => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value'
    )!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
async function select(index: number, value: string) {
  await act(() => {
    const control = container.querySelectorAll('select')[index]!;
    control.value = value;
    control.dispatchEvent(new Event('change', { bubbles: true }));
  });
}
const covers = shelf.map((item, index) => ({
  ...item,
  draft: {
    ...item.draft,
    image: index % 2 ? 'https://example.test/cover.png' : '',
  },
}));
it.each(['en', 'vi'])(
  'combines artwork with current Studio facets in %s without transport',
  async (locale) => {
    state.locale = locale;
    const messages = locale === 'vi' ? vietnamese.lettin : en.lettin;
    const transport = vi.fn();
    vi.stubGlobal('fetch', transport);
    await render(covers);
    expect(titles()).toEqual(covers.map((item) => item.id));
    expect(
      container.querySelector(
        `fieldset[aria-label="${messages.studioArtwork}"]`
      )
    ).not.toBeNull();
    await click(messages.studioArtwork_without);
    expect(titles()).toEqual(['Owned draft', 'Shared editor']);
    expect(container.querySelectorAll('img')).toHaveLength(0);
    await click(messages.studioArtwork_with);
    await click(messages.studioMembership_collaborating);
    await click(messages.published);
    await select(0, 'test');
    await select(1, 'descending');
    await search('Shared');
    expect(titles()).toEqual(['Shared publisher']);
    expect(transport).not.toHaveBeenCalled();
  }
);
it('clears artwork and all other filters after an empty result', async () => {
  await render(covers);
  await click(en.lettin.studioArtwork_with);
  await click(en.lettin.studioMembership_owned);
  await click(en.lettin.draft);
  await select(0, 'test');
  await select(1, 'descending');
  await search('missing');
  expect(titles()).toEqual([]);
  await click(en.lettin.clearFilters);
  expect(titles()).toEqual(covers.map((item) => item.id));
  expect(container.querySelectorAll('select')[1]?.value).toBe('source');
  expect(
    [...container.querySelectorAll('button')]
      .find((button) => button.textContent === en.lettin.studioArtwork_all)
      ?.getAttribute('aria-pressed')
  ).toBe('true');
});
it('resets the artwork facet when changing workspaces', async () => {
  await render(covers);
  await click(en.lettin.studioArtwork_without);
  expect(titles()).toHaveLength(2);
  await render(covers, 'workspace-b');
  expect(titles()).toHaveLength(4);
  expect(
    [...container.querySelectorAll('a')].every((link) =>
      link.getAttribute('href')?.startsWith('/workspace-b/')
    )
  ).toBe(true);
});
it('uses saved draft covers rather than published covers and updates with the authorized overview', async () => {
  const current: LettinOverview['worlds'] = covers.map((item) => ({
    ...item,
    published: {
      ...item.draft,
      image: item.draft.image ? '' : 'https://example.test/published.png',
    },
  }));
  await render(current);
  await click(en.lettin.studioArtwork_without);
  expect(titles()).toEqual(['Owned draft', 'Shared editor']);
  const changed = current.map((item) =>
    item.id === 'Owned draft'
      ? {
          ...item,
          draft: { ...item.draft, image: 'https://example.test/new.png' },
        }
      : item
  );
  await render(changed);
  expect(titles()).toEqual(['Shared editor']);
  await render(changed.filter((item) => item.role === 'owner'));
  expect(titles()).toEqual([]);
  await render([]);
  expect(container.querySelectorAll('a')).toHaveLength(0);
});
it('classifies cover presence consistently with the existing cover renderer', () => {
  expect(matchesStudioArtwork('', 'all')).toBe(true);
  expect(matchesStudioArtwork('', 'with')).toBe(false);
  expect(matchesStudioArtwork('', 'without')).toBe(true);
  expect(matchesStudioArtwork('saved-image', 'with')).toBe(true);
  expect(matchesStudioArtwork('saved-image', 'without')).toBe(false);
});
