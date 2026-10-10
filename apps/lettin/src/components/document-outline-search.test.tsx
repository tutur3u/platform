// @vitest-environment jsdom
import type { LettinDraft, LettinNode } from '@tuturuuu/internal-api/lettin';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import en from '../../messages/en.json';
import viMessages from '../../messages/vi.json';
import {
  filterOutlineItems,
  outlineSearchLimit,
} from './document-outline-search';
import { DocumentView } from './document-view';

let language: 'en' | 'vi' = 'en';
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) =>
    (language === 'en' ? en : viMessages).lettin[key as keyof typeof en.lettin],
}));
const heading = (text: string): LettinNode => ({
  type: 'heading',
  attrs: { level: 2 },
  content: [{ type: 'text', text }],
});
const draft: LettinDraft = {
  title: 'Notebook',
  description: 'Unsearched description',
  kind: 'page',
  image: '',
  credit: '',
  tags: [],
  links: [],
  content: {
    type: 'doc',
    content: [
      heading('Opening'),
      {
        type: 'details',
        content: [
          { type: 'detailsSummary', content: [{ type: 'text', text: 'Fold' }] },
          { type: 'detailsContent', content: [heading('Thế giới')] },
        ],
      },
    ],
  },
};
const container = document.createElement('div');
document.body.append(container);
let root = createRoot(container);
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
afterEach(async () => {
  await act(() => root.unmount());
  root = createRoot(container);
  language = 'en';
  vi.restoreAllMocks();
});
async function typeSearch(
  value: string,
  article = container.querySelector('article')!
) {
  const input = article.querySelector<HTMLInputElement>(
    'input[type="search"]'
  )!;
  await act(() => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value'
    )!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
const labels = (scope: ParentNode = container) =>
  [...scope.querySelectorAll('nav a')].map((a) => a.textContent);
it('starts with all headings and filters only outline labels without removing content', async () => {
  await act(() => root.render(<DocumentView draft={draft} showOutline />));
  expect(labels()).toEqual(['Opening', 'Thế giới']);
  await typeSearch('  OPEN ');
  expect(labels()).toEqual(['Opening']);
  expect(container.querySelector('article')!.textContent).toContain('Thế giới');
  await typeSearch('Unsearched description');
  expect(labels()).toEqual([]);
  expect(container.querySelector('[role="status"]')!.textContent).toBe(
    en.lettin.outlineSearchEmpty
  );
  await act(() =>
    container.querySelector<HTMLButtonElement>('nav button')!.click()
  );
  expect(labels()).toEqual(['Opening', 'Thế giới']);
  expect(container.querySelector('[role="status"]')).toBeNull();
});
it('matches normalized Vietnamese labels and preserves scoped fold opening and focus', async () => {
  const scroll = vi.fn();
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: scroll,
  });
  await act(() =>
    root.render(
      <DocumentView draft={draft} showOutline outlineScope="reader" />
    )
  );
  await typeSearch('THẾ GIỚI'.normalize('NFD'));
  expect(labels()).toEqual(['Thế giới']);
  const before = window.location.href;
  await act(() => container.querySelector<HTMLAnchorElement>('nav a')!.click());
  expect(container.querySelector('details')!.open).toBe(true);
  expect(document.activeElement?.textContent).toBe('Thế giới');
  expect(scroll).toHaveBeenCalledWith({ block: 'start', behavior: 'auto' });
  expect(window.location.href).toBe(before);
});
it('searches current display labels only and bounds queries without using IDs as text', () => {
  const items = [{ id: 'secret-source-id', label: 'Visible', level: 2 }];
  expect(filterOutlineItems(items, 'secret-source-id')).toEqual([]);
  expect(filterOutlineItems(items, 'Visible')).toEqual(items);
  expect(
    filterOutlineItems(items, `${' '.repeat(outlineSearchLimit)}missing`)
  ).toBe(items);
});
it('bounds pasted input and keeps truncation feedback visible for empty results', async () => {
  const large = {
    ...draft,
    content: {
      type: 'doc',
      content: Array.from({ length: 105 }, (_, i) => heading(`Section ${i}`)),
    },
  };
  await act(() => root.render(<DocumentView draft={large} showOutline />));
  await typeSearch('x'.repeat(120));
  const input = container.querySelector<HTMLInputElement>('input')!;
  expect(input.maxLength).toBe(100);
  expect(input.value).toHaveLength(100);
  expect(container.querySelector('nav')!.textContent).toContain(
    en.lettin.outlineSearchEmpty
  );
  expect(container.querySelector('nav')!.textContent).toContain(
    en.lettin.documentOutlineLimit
  );
});
it('resets search when current heading labels or scoped targets change', async () => {
  await act(() =>
    root.render(<DocumentView draft={draft} showOutline outlineScope="first" />)
  );
  await typeSearch('Opening');
  await act(() =>
    root.render(
      <DocumentView draft={draft} showOutline outlineScope="second" />
    )
  );
  expect(container.querySelector<HTMLInputElement>('input')!.value).toBe('');
  await typeSearch('Opening');
  await act(() =>
    root.render(
      <DocumentView
        draft={{
          ...draft,
          content: {
            type: 'doc',
            content: [heading('New first'), heading('New second')],
          },
        }}
        showOutline
        outlineScope="second"
      />
    )
  );
  expect(container.querySelector<HTMLInputElement>('input')!.value).toBe('');
  expect(labels()).toEqual(['New first', 'New second']);
});
it('isolates searches between articles and leaves private previews without controls', async () => {
  await act(() =>
    root.render(
      <>
        <DocumentView draft={draft} showOutline outlineScope="first" />
        <DocumentView draft={draft} showOutline outlineScope="second" />
        <DocumentView draft={draft} />
      </>
    )
  );
  const articles = container.querySelectorAll('article');
  await typeSearch('missing', articles[0]!);
  expect(labels(articles[0]!)).toEqual([]);
  expect(labels(articles[1]!)).toEqual(['Opening', 'Thế giới']);
  expect(articles[2]!.querySelector('nav')).toBeNull();
  expect(articles[2]!.querySelector('input')).toBeNull();
});
it.each(['en', 'vi'] as const)(
  'renders actual %s search, clear and empty feedback strings',
  async (locale) => {
    language = locale;
    const messages = (locale === 'en' ? en : viMessages).lettin;
    await act(() => root.render(<DocumentView draft={draft} showOutline />));
    expect(container.querySelector('nav label')!.textContent).toBe(
      messages.outlineSearch
    );
    await typeSearch('missing');
    expect(container.querySelector('nav button')!.textContent).toBe(
      messages.outlineSearchClear
    );
    expect(container.querySelector('[role="status"]')!.textContent).toBe(
      messages.outlineSearchEmpty
    );
  }
);
