// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, type ComponentProps } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import en from '../../messages/en.json';
import vietnamese from '../../messages/vi.json';
import { SavedCreators } from './saved-creators';
import { matchesSavedLibrary } from './saved-library-filters';
import { SavedNotebooks } from './saved-notebooks';

const api = vi.hoisted(() => ({
  notebooks: vi.fn(),
  creators: vi.fn(),
  removeNotebook: vi.fn(),
  removeCreator: vi.fn(),
  locale: 'en',
}));
vi.mock('@tuturuuu/internal-api/lettin', () => ({
  getLettinSavedNotebooks: api.notebooks,
  getLettinSavedCreators: api.creators,
  setLettinNotebookSaved: api.removeNotebook,
  setLettinCreatorSaved: api.removeCreator,
}));
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) => {
    const message = (api.locale === 'vi' ? vietnamese : en).lettin[
      key as keyof typeof en.lettin
    ];
    return typeof message === 'string'
      ? message.replace(
          /\{(\w+)\}/g,
          (_, name: string) => values?.[name] ?? `{${name}}`
        )
      : key;
  },
}));
vi.mock('@/i18n/navigation', () => ({
  Link: (props: ComponentProps<'a'>) => <a {...props} />,
}));
vi.mock('@tuturuuu/ui/button', () => ({
  Button: ({
    variant: _variant,
    ...props
  }: ComponentProps<'button'> & { variant?: string }) => <button {...props} />,
}));
const notebook = (title: string) => ({
  title,
  description: '',
  image: '',
  credit: '',
});
const notebookData = [
  { worldId: 'first', savedAt: '', notebook: notebook('ĐỒNG HỒ') },
  { worldId: 'second', savedAt: '', notebook: notebook('River story') },
  { worldId: 'SECRET_DRAFT_ID', savedAt: '', notebook: null },
];
const creatorData = [
  { creatorId: 'first', savedAt: '', notebookTitle: 'ĐỒNG HỒ' },
  { creatorId: 'second', savedAt: '', notebookTitle: 'River story' },
  { creatorId: 'SECRET_DRAFT_ID', savedAt: '', notebookTitle: null },
];
type Kind = 'notebooks' | 'creators';
const container = document.createElement('div');
const root = createRoot(container);
let client: QueryClient;
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
afterEach(async () => {
  await act(() => root.render(null));
  client?.clear();
  vi.resetAllMocks();
  api.locale = 'en';
});
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
}
async function render(kind: Kind, actorId = 'actor-a') {
  await act(() =>
    root.render(
      <QueryClientProvider client={client}>
        {kind === 'notebooks' ? (
          <SavedNotebooks actorId={actorId} />
        ) : (
          <SavedCreators actorId={actorId} />
        )}
      </QueryClientProvider>
    )
  );
  await settle();
}
async function mount(kind: Kind) {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  api.notebooks.mockResolvedValue(notebookData);
  api.creators.mockResolvedValue(creatorData);
  await render(kind);
}
async function search(value: string) {
  await act(() => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value'
    )!.set!.call(container.querySelector('input')!, value);
    container
      .querySelector('input')!
      .dispatchEvent(new Event('input', { bubbles: true }));
  });
}
async function availability(value: string) {
  await act(() => {
    container.querySelector('select')!.value = value;
    container
      .querySelector('select')!
      .dispatchEvent(new Event('change', { bubbles: true }));
  });
}
it.each(['notebooks', 'creators'] as const)(
  'filters %s locally without extra reads, writes, or unavailable metadata search',
  async (kind) => {
    await mount(kind);
    expect(container.querySelectorAll('li')).toHaveLength(3);
    await availability('available');
    expect(container.querySelectorAll('li')).toHaveLength(2);
    await search('  đồng hồ  ');
    expect(container.querySelectorAll('li')).toHaveLength(1);
    expect(container.querySelector('li')?.textContent).toContain('ĐỒNG HỒ');
    await search('SECRET_DRAFT_ID');
    expect(container.querySelectorAll('li')).toHaveLength(0);
    expect(container.textContent).toContain(en.lettin.savedLibraryNoMatches);
    await act(() =>
      [...container.querySelectorAll('button')]
        .find(
          (button) => button.textContent === en.lettin.savedLibraryClearFilters
        )!
        .click()
    );
    expect(container.querySelectorAll('li')).toHaveLength(3);
    await availability('unavailable');
    expect(container.querySelectorAll('li')).toHaveLength(1);
    expect(container.querySelector('li a')).toBeNull();
    expect(
      kind === 'notebooks' ? api.notebooks : api.creators
    ).toHaveBeenCalledExactlyOnceWith('actor-a');
    expect(api.removeNotebook).not.toHaveBeenCalled();
    expect(api.removeCreator).not.toHaveBeenCalled();
  }
);
it.each(['notebooks', 'creators'] as const)(
  'resets %s filters and caches when the actor changes',
  async (kind) => {
    await mount(kind);
    await search('River');
    await availability('available');
    await render(kind, 'actor-b');
    expect(container.querySelector('input')?.value).toBe('');
    expect(container.querySelector('select')?.value).toBe('all');
    expect(container.querySelectorAll('li')).toHaveLength(3);
    expect(
      kind === 'notebooks' ? api.notebooks : api.creators
    ).toHaveBeenLastCalledWith('actor-b');
  }
);
it.each(['notebooks', 'creators'] as const)(
  'retains filtered unavailable %s after a denied removal',
  async (kind) => {
    await mount(kind);
    await availability('unavailable');
    const remove =
      kind === 'notebooks' ? api.removeNotebook : api.removeCreator;
    remove.mockRejectedValue(new Error('Account changed'));
    await act(() =>
      container
        .querySelector('li button')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    );
    await settle();
    expect(remove).toHaveBeenCalledExactlyOnceWith(
      'SECRET_DRAFT_ID',
      false,
      'actor-a'
    );
    expect(container.querySelectorAll('li')).toHaveLength(1);
    expect(container.querySelector('li a')).toBeNull();
    expect(container.querySelector('select')?.value).toBe('unavailable');
    expect(container.querySelector('[role=alert]')?.textContent).toContain(
      en.lettin.requestFailed
    );
  }
);
it.each([
  ['en', en],
  ['vi', vietnamese],
] as const)(
  'renders the shipped %s filter labels and bounds ephemeral search',
  async (locale, messages) => {
    api.locale = locale;
    await mount('notebooks');
    expect(container.textContent).toContain(messages.lettin.savedLibrarySearch);
    expect(container.textContent).toContain(
      messages.lettin.savedLibraryAvailability
    );
    expect(container.textContent).toContain(
      messages.lettin.savedLibraryFilterHint
    );
    for (const key of [
      'savedLibraryAvailability_all',
      'savedLibraryAvailability_available',
      'savedLibraryAvailability_unavailable',
    ] as const)
      expect(container.textContent).toContain(messages.lettin[key]);
    await search('x'.repeat(150));
    expect(container.querySelector('input')?.value).toHaveLength(100);
    expect(container.textContent).toContain(
      messages.lettin.savedLibraryNoMatches
    );
  }
);
it('matches normalized published titles without mutation or unavailable fallbacks', () => {
  const filters = { search: 'e\u0301cole', availability: 'all' as const };
  expect(matchesSavedLibrary(filters, 'ÉCOLE', true)).toBe(true);
  expect(matchesSavedLibrary(filters, 'ÉCOLE', false)).toBe(false);
  expect(matchesSavedLibrary(filters, null, false)).toBe(false);
  expect(filters.search).toBe('e\u0301cole');
});
