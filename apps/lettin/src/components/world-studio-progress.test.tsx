// @vitest-environment jsdom
import type { LettinRecord, LettinWorld } from '@tuturuuu/internal-api/lettin';
import { act, type ComponentProps } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { WorldStudio } from './world-studio';

const entry = (
  id: string,
  workProgress?: LettinRecord['draft']['workProgress']
): LettinRecord => ({
  id,
  version: 1,
  published: null,
  published_at: null,
  draft: {
    title: id,
    description: 'Private idea',
    kind: 'character',
    image: '',
    credit: '',
    tags: [],
    links: [],
    content: { type: 'doc' },
    workProgress,
  },
});
let dirty = false;
const data: LettinWorld = {
  world: entry('notebook'),
  role: 'owner',
  entries: [entry('Old'), entry('Alice', 'drafting'), entry('Bob', 'ready')],
  collaborators: [],
  eligibleMembers: [],
};
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data, isPending: false, isError: false }),
}));
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: { count?: number }) =>
    values?.count === undefined ? key : `${key}:${values.count}`,
  useLocale: () => 'en',
}));
vi.mock('@tuturuuu/ui/button', () => ({
  Button: ({
    variant: _variant,
    ...props
  }: ComponentProps<'button'> & { variant?: string }) => {
    void _variant;
    return <button {...props} />;
  },
}));
vi.mock('@tuturuuu/ui/input', () => ({
  Input: (props: ComponentProps<'input'>) => <input {...props} />,
}));
vi.mock('@/i18n/navigation', () => ({
  Link: (props: ComponentProps<'a'>) => <a {...props} />,
}));
vi.mock('./notebook-export', () => ({ NotebookExport: () => null }));
vi.mock('./collaborators', () => ({ Collaborators: () => null }));
vi.mock('./duplicate-entry', () => ({ DuplicateEntry: () => null }));
vi.mock('./entry-editor', () => ({
  EntryEditor: ({ record }: { record: LettinRecord }) => (
    <p>{`Editing ${record.id}`}</p>
  ),
}));
vi.mock('./navigation-guard', () => ({
  useNavigationGuard: () => ({ dirty, setDirty: () => {} }),
}));
vi.mock('./wiki-sidebar', () => ({ WikiSidebar: () => null }));
vi.mock('./quick-note', () => ({ QuickNote: () => null }));
vi.mock('./wiki-create-entry', () => ({ WikiCreateEntry: () => null }));
vi.mock('./wiki-browser', () => ({
  WikiBrowser: ({
    entries,
    onSelect,
  }: {
    entries: LettinRecord[];
    onSelect: (id: string) => void;
  }) => (
    <div data-testid="results">
      {entries.map((entry) => (
        <button type="button" key={entry.id} onClick={() => onSelect(entry.id)}>
          {entry.id}
        </button>
      ))}
    </div>
  ),
}));
const container = document.createElement('div');
const root = createRoot(container);
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
afterEach(async () => {
  await act(async () => root.render(null));
  vi.clearAllMocks();
  dirty = false;
});
const setProgress = async (value: string) => {
  const select = container.querySelector('select')!;
  await act(async () => {
    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
};
it('filters saved studio drafts, restores all and opens the matching record', async () => {
  await act(async () =>
    root.render(
      <WorldStudio wsId="workspace" worldId="notebook" section="characters" />
    )
  );
  const summary = () =>
    container.querySelector('[aria-label="workProgressSummary"]')!.textContent;
  const initialSummary = summary();
  expect(
    [
      ...container.querySelectorAll('[aria-label="workProgressSummary"] dd'),
    ].map((dd) => dd.textContent)
  ).toEqual([
    'workProgressSummaryCount:1',
    'workProgressSummaryCount:1',
    'workProgressSummaryCount:0',
    'workProgressSummaryCount:1',
  ]);
  const results = () =>
    container.querySelector('[data-testid="results"]')!.textContent;
  expect(results()).toBe('OldAliceBob');
  await setProgress('unstarted');
  expect(results()).toBe('Old');
  await setProgress('ready');
  expect(results()).toBe('Bob');
  expect(summary()).toBe(initialSummary);
  await setProgress('all');
  expect(results()).toBe('OldAliceBob');
  await setProgress('drafting');
  await act(async () =>
    container
      .querySelector<HTMLButtonElement>('[data-testid="results"] button')!
      .click()
  );
  expect(container.textContent).toContain('Editing Alice');
  expect(window.location.search).toContain('entry=Alice');
});
it('retains typed search when progress changes and provides an empty matching result', async () => {
  await act(async () =>
    root.render(
      <WorldStudio wsId="workspace" worldId="notebook" section="characters" />
    )
  );
  const input = browseField('searchWiki') as HTMLInputElement;
  expect(input.type).toBe('text');
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value'
    )!.set!.call(input, 'Alice');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await setProgress('ready');
  expect(input.value).toBe('Alice');
  expect(
    container.querySelector<HTMLInputElement>('input[type="date"]')!.value
  ).toBe('');
  expect(container.querySelector('[data-testid="results"]')!.textContent).toBe(
    ''
  );
  await setProgress('drafting');
  expect(container.querySelector('[data-testid="results"]')!.textContent).toBe(
    'Alice'
  );
});

function browseField(label: string) {
  return [...container.querySelectorAll('label')]
    .find((node) => node.textContent?.startsWith(label))!
    .querySelector<HTMLInputElement | HTMLSelectElement>('input,select')!;
}
async function chooseFacet(label: string, value: string) {
  await act(() => {
    const input = browseField(label);
    if (input instanceof HTMLInputElement) {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value'
      )!.set!.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      input.value = value;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
}
const clearButton = () =>
  [...container.querySelectorAll<HTMLButtonElement>('button')].find(
    (button) => button.textContent === 'clearFilters'
  )!;
it('clears work stage and all standard facets together without changing saved records or summary', async () => {
  const before = JSON.stringify(data);
  await act(() =>
    root.render(
      <WorldStudio wsId="workspace" worldId="notebook" section="characters" />
    )
  );
  const summary = container.querySelector(
    '[aria-label="workProgressSummary"]'
  )!.textContent;
  const location = window.location.href;
  await setProgress('ready');
  await chooseFacet('searchWiki', 'Alice');
  await chooseFacet('wikiPublicationFilter', 'published');
  await chooseFacet('wikiSort', 'titleDesc');
  expect(container.querySelector('[data-testid="results"]')!.textContent).toBe(
    ''
  );
  await act(() => clearButton().click());
  expect(container.querySelector('[data-testid="results"]')!.textContent).toBe(
    'OldAliceBob'
  );
  expect(container.querySelector('select')!.value).toBe('all');
  expect(browseField('searchWiki').value).toBe('');
  expect(browseField('wikiPublicationFilter').value).toBe('all');
  expect(browseField('wikiTagFilter').value).toBe('');
  expect(browseField('wikiSort').value).toBe('original');
  expect(
    container.querySelector('[aria-label="workProgressSummary"]')!.textContent
  ).toBe(summary);
  expect(JSON.stringify(data)).toBe(before);
  expect(window.location.href).toBe(location);
  expect(container.textContent).not.toContain('Editing ');
});
it('clears an unavailable tag selection and stage after saved entries refresh', async () => {
  const original = structuredClone(data.entries);
  try {
    data.entries[2]!.draft.tags = ['ready-only'];
    await act(() =>
      root.render(
        <WorldStudio wsId="workspace" worldId="notebook" section="characters" />
      )
    );
    await setProgress('ready');
    await chooseFacet('wikiTagFilter', 'ready-only');
    data.entries[2]!.draft.tags = [];
    await act(() =>
      root.render(
        <WorldStudio wsId="workspace" worldId="notebook" section="characters" />
      )
    );
    expect(browseField('wikiTagFilter').value).toBe('ready-only');
    expect(
      container.querySelector('[data-testid="results"]')!.textContent
    ).toBe('');
    await act(() => clearButton().click());
    expect(
      container.querySelector('[data-testid="results"]')!.textContent
    ).toBe('OldAliceBob');
    expect(browseField('wikiTagFilter').value).toBe('');
    expect(container.querySelector('select')!.value).toBe('all');
  } finally {
    data.entries = original;
  }
});
it('keeps composed reset disabled while dirty and recovers only after editing is unblocked', async () => {
  await act(() =>
    root.render(
      <WorldStudio wsId="workspace" worldId="notebook" section="characters" />
    )
  );
  await setProgress('ready');
  dirty = true;
  await act(() =>
    root.render(
      <WorldStudio wsId="workspace" worldId="notebook" section="characters" />
    )
  );
  expect(clearButton().disabled).toBe(true);
  await act(() => clearButton().click());
  expect(container.querySelector('[data-testid="results"]')!.textContent).toBe(
    'Bob'
  );
  expect(container.querySelector('select')!.value).toBe('ready');
  dirty = false;
  await act(() =>
    root.render(
      <WorldStudio wsId="workspace" worldId="notebook" section="characters" />
    )
  );
  await act(() => clearButton().click());
  expect(container.querySelector('[data-testid="results"]')!.textContent).toBe(
    'OldAliceBob'
  );
});
