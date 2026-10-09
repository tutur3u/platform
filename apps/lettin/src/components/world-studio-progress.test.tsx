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
  useTranslations: () => (key: string) => key,
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
vi.mock('./collaborators', () => ({ Collaborators: () => null }));
vi.mock('./duplicate-entry', () => ({ DuplicateEntry: () => null }));
vi.mock('./entry-editor', () => ({
  EntryEditor: ({ record }: { record: LettinRecord }) => (
    <p>{`Editing ${record.id}`}</p>
  ),
}));
vi.mock('./navigation-guard', () => ({
  useNavigationGuard: () => ({ dirty: false, setDirty: () => {} }),
}));
vi.mock('./wiki-sidebar', () => ({ WikiSidebar: () => null }));
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
  const results = () =>
    container.querySelector('[data-testid="results"]')!.textContent;
  expect(results()).toBe('OldAliceBob');
  await setProgress('unstarted');
  expect(results()).toBe('Old');
  await setProgress('ready');
  expect(results()).toBe('Bob');
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
  const input = container.querySelector('input')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value'
    )!.set!.call(input, 'Alice');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await setProgress('ready');
  expect(input.value).toBe('Alice');
  expect(container.querySelector('[data-testid="results"]')!.textContent).toBe(
    ''
  );
  await setProgress('drafting');
  expect(container.querySelector('[data-testid="results"]')!.textContent).toBe(
    'Alice'
  );
});
