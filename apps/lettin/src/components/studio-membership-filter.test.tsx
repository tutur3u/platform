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
const world = (id: string, role: LettinRole, published = false) => ({
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
    tags: ['test'],
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
it.each(['en', 'vi'])(
  'filters existing owner/editor/publisher roles locally in %s',
  async (locale) => {
    state.locale = locale;
    const messages = locale === 'vi' ? vietnamese.lettin : en.lettin;
    const transport = vi.fn();
    vi.stubGlobal('fetch', transport);
    await render();
    expect(titles()).toEqual(shelf.map((item) => item.id));
    await click(messages.studioMembership_owned);
    expect(titles()).toEqual(['Owned draft', 'Owned published']);
    await click(messages.studioMembership_collaborating);
    expect(titles()).toEqual(['Shared editor', 'Shared publisher']);
    expect(
      container.querySelector('button[aria-pressed="true"]')?.textContent
    ).toBe(messages.all);
    expect(
      [...container.querySelectorAll('button[aria-pressed="true"]')].map(
        (el) => el.textContent
      )
    ).toContain(messages.studioMembership_collaborating);
    await click(messages.studioMembership_all);
    expect(titles()).toHaveLength(4);
    expect(transport).not.toHaveBeenCalled();
  }
);
it('combines membership, publication and search; clears all facets after empty results', async () => {
  await render();
  await click(en.lettin.studioMembership_collaborating);
  await click(en.lettin.published);
  expect(titles()).toEqual(['Shared publisher']);
  await search('Owned');
  expect(titles()).toEqual([]);
  expect(container.textContent).toContain(en.lettin.noStudioResults);
  await click(en.lettin.clearFilters);
  expect(titles()).toHaveLength(4);
  expect(container.querySelector('input')?.value).toBe('');
  expect(
    [...container.querySelectorAll('button[aria-pressed="true"]')].map(
      (el) => el.textContent
    )
  ).toEqual([
    en.lettin.all,
    en.lettin.studioMembership_all,
    en.lettin.studioArtwork_all,
  ]);
});
it('resets local facets and destination links when changing workspace', async () => {
  await render();
  await click(en.lettin.studioMembership_owned);
  await click(en.lettin.draft);
  await search('Owned');
  expect(titles()).toEqual(['Owned draft']);
  await render(shelf, 'workspace-b');
  expect(titles()).toHaveLength(4);
  expect(container.querySelector('input')?.value).toBe('');
  expect(
    [...container.querySelectorAll('a')].every((link) =>
      link.getAttribute('href')?.startsWith('/workspace-b/')
    )
  ).toBe(true);
});
it('uses current overview roles and removes withdrawn access instead of retaining filtered records', async () => {
  await render();
  await click(en.lettin.studioMembership_collaborating);
  await render([world('Shared editor', 'owner'), shelf[3]!]);
  expect(titles()).toEqual(['Shared publisher']);
  await render([]);
  expect(titles()).toEqual([]);
  expect(container.querySelectorAll('a')).toHaveLength(0);
  await click(en.lettin.clearFilters);
  expect(titles()).toEqual([]);
});
