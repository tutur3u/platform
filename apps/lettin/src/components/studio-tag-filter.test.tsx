// @vitest-environment jsdom
import type { LettinOverview, LettinRole } from '@tuturuuu/internal-api/lettin';
import { act, type ComponentProps } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import en from '../../messages/en.json';
import vietnamese from '../../messages/vi.json';
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
async function selectTag(value: string) {
  await act(() => {
    const select = container.querySelector('select')!;
    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
}
const tagOptions = () =>
  [...container.querySelector('select')!.querySelectorAll('option')].map(
    (option) => option.textContent
  );
const taggedShelf = [
  world('Owned draft', 'owner', false, ['fantasy', 'fantasy', ' ']),
  world('Owned published', 'owner', true, ['mystery']),
  world('Shared editor', 'editor', false, ['fantasy']),
  world('Shared publisher', 'publisher', true, ['fantasy', 'mystery']),
];
it.each(['en', 'vi'])(
  'combines current tags and membership in %s without transport',
  async (locale) => {
    state.locale = locale;
    const messages = locale === 'vi' ? vietnamese.lettin : en.lettin;
    const transport = vi.fn();
    vi.stubGlobal('fetch', transport);
    await render(taggedShelf);
    expect(titles()).toHaveLength(4);
    expect(tagOptions()).toEqual([
      messages.studioAllTags,
      'fantasy',
      'mystery',
    ]);
    expect(
      container.querySelector('label select')?.parentElement?.textContent
    ).toContain(messages.studioTagFilter);
    await selectTag('fantasy');
    await click(messages.studioMembership_collaborating);
    await click(messages.published);
    expect(titles()).toEqual(['Shared publisher']);
    await search('Shared');
    expect(titles()).toEqual(['Shared publisher']);
    expect(transport).not.toHaveBeenCalled();
  }
);
it('clears tag, membership, publication and search together after empty results', async () => {
  await render(taggedShelf);
  await selectTag('mystery');
  await click(en.lettin.studioMembership_collaborating);
  await click(en.lettin.draft);
  await search('missing');
  expect(titles()).toEqual([]);
  await click(en.lettin.clearFilters);
  expect(titles()).toEqual(taggedShelf.map((item) => item.id));
  expect(container.querySelector('select')?.value).toBe('');
  expect(container.querySelector('input')?.value).toBe('');
});
it('resets the tag and other facets on workspace change', async () => {
  await render(taggedShelf);
  await selectTag('fantasy');
  await click(en.lettin.studioMembership_owned);
  expect(titles()).toEqual(['Owned draft']);
  await render(taggedShelf, 'workspace-b');
  expect(titles()).toHaveLength(4);
  expect(container.querySelector('select')?.value).toBe('');
  expect(
    [...container.querySelectorAll('a')].every((link) =>
      link.getAttribute('href')?.startsWith('/workspace-b/')
    )
  ).toBe(true);
});
it('drops revoked records and options, resets an obsolete tag, and does not reactivate it later', async () => {
  await render(taggedShelf);
  await selectTag('fantasy');
  await render([taggedShelf[1]!]);
  expect(titles()).toEqual(['Owned published']);
  expect(tagOptions()).toEqual([en.lettin.studioAllTags, 'mystery']);
  expect(container.querySelector('select')?.value).toBe('');
  await render(taggedShelf);
  expect(titles()).toHaveLength(4);
  await render([]);
  expect(tagOptions()).toEqual([en.lettin.studioAllTags]);
  expect(container.querySelectorAll('a')).toHaveLength(0);
});
it('matches exact saved tags rather than tag substrings or descriptions', async () => {
  await render([
    world('One', 'owner', false, ['art']),
    world('Two', 'editor', false, ['artwork']),
  ]);
  await selectTag('art');
  expect(titles()).toEqual(['One']);
  await selectTag('artwork');
  expect(titles()).toEqual(['Two']);
});
