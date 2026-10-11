// @vitest-environment jsdom
import type { LettinOverview, LettinRole } from '@tuturuuu/internal-api/lettin';
import { act, type ComponentProps } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import en from '../../messages/en.json';
import vietnamese from '../../messages/vi.json';
import { orderStudioWorlds } from './studio-order';
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
const orderedShelf = [
  world('Notebook 10', 'editor', true, ['story']),
  world('Notebook 2', 'owner', true, ['story']),
  world('Notebook 1', 'editor', false, ['other']),
  world('Notebook 3', 'editor', true, ['story']),
];
it.each(['en', 'vi'])(
  'orders current titles naturally in %s without transport',
  async (locale) => {
    state.locale = locale;
    const messages = locale === 'vi' ? vietnamese.lettin : en.lettin;
    const transport = vi.fn();
    vi.stubGlobal('fetch', transport);
    await render(orderedShelf);
    expect(titles()).toEqual(orderedShelf.map((item) => item.id));
    expect(
      container.querySelectorAll('select')[1]?.parentElement?.textContent
    ).toContain(messages.studioOrder);
    await select(1, 'ascending');
    expect(titles()).toEqual([
      'Notebook 1',
      'Notebook 2',
      'Notebook 3',
      'Notebook 10',
    ]);
    await select(0, 'story');
    await click(messages.studioMembership_collaborating);
    await click(messages.published);
    await search('Notebook');
    expect(titles()).toEqual(['Notebook 3', 'Notebook 10']);
    await select(1, 'descending');
    expect(titles()).toEqual(['Notebook 10', 'Notebook 3']);
    expect(transport).not.toHaveBeenCalled();
  }
);
it('restores source order and all facets when clearing an empty result', async () => {
  await render(orderedShelf);
  await select(1, 'descending');
  await select(0, 'story');
  await click(en.lettin.studioMembership_owned);
  await click(en.lettin.published);
  await search('missing');
  expect(titles()).toEqual([]);
  await click(en.lettin.clearFilters);
  expect(titles()).toEqual(orderedShelf.map((item) => item.id));
  expect(container.querySelectorAll('select')[1]?.value).toBe('source');
});
it('resets order on workspace change and drops revoked records from the ordered view', async () => {
  await render(orderedShelf);
  await select(1, 'ascending');
  await render([orderedShelf[0]!, orderedShelf[2]!]);
  expect(titles()).toEqual(['Notebook 1', 'Notebook 10']);
  await render(orderedShelf, 'workspace-b');
  expect(titles()).toEqual(orderedShelf.map((item) => item.id));
  expect(container.querySelectorAll('select')[1]?.value).toBe('source');
  await render([], 'workspace-b');
  expect(titles()).toEqual([]);
});
it.each(['en', 'vi'])(
  'preserves equal-title ties and input records with %s comparisons',
  (locale) => {
    const input = [
      world('Café', 'owner'),
      world('cafe', 'editor'),
      world('10', 'owner'),
      world('2', 'owner'),
    ];
    const before = JSON.stringify(input);
    const ascending = orderStudioWorlds(input, 'ascending', locale);
    expect(ascending.map((item) => item.id)).toEqual([
      '2',
      '10',
      'Café',
      'cafe',
    ]);
    expect(
      orderStudioWorlds(input, 'descending', locale).map((item) => item.id)
    ).toEqual(['Café', 'cafe', '10', '2']);
    expect(orderStudioWorlds(input, 'source', locale)).toEqual(input);
    expect(JSON.stringify(input)).toBe(before);
  }
);
