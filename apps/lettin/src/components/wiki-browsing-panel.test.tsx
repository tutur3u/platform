// @vitest-environment jsdom
import type { LettinRecord } from '@tuturuuu/internal-api/lettin';
import { act, type ComponentProps, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { initialWikiFilters } from './wiki-browse-model';
import { WikiBrowser } from './wiki-browser';
import { WikiBrowsingPanel } from './wiki-browsing-panel';
import type { WikiSection } from './wiki-model';

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string, args?: { count: number }) =>
    args ? `${key}:${args.count}` : key,
}));
vi.mock('@tuturuuu/ui/button', () => ({
  Button: ({
    variant: _variant,
    ...props
  }: ComponentProps<'button'> & { variant?: string }) => <button {...props} />,
}));
vi.mock('@tuturuuu/ui/input', () => ({
  Input: (props: ComponentProps<'input'>) => <input {...props} />,
}));
const container = document.createElement('div');
document.body.append(container);
let root = createRoot(container);
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
afterEach(async () => {
  await act(() => root.unmount());
  root = createRoot(container);
  vi.clearAllMocks();
});
const select = vi.fn();
const entries: LettinRecord[] = ['Private entry', 'Public entry'].map(
  (title, i) => {
    const draft = {
      title,
      description: '',
      kind: 'page' as const,
      image: '',
      credit: '',
      tags: [i ? 'art' : 'story'],
      links: [],
      content: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: i ? 'Public body' : 'Private saved words' },
            ],
          },
        ],
      },
    };
    return {
      id: `entry-${i}`,
      version: 1,
      draft,
      published: i ? structuredClone(draft) : null,
      published_at: i ? '2026-10-09' : null,
    };
  }
);
function Harness({
  section = 'overview',
  disabled = false,
  records = entries,
}: {
  section?: WikiSection;
  disabled?: boolean;
  records?: LettinRecord[];
}) {
  const [filters, onChange] = useState(initialWikiFilters);
  return (
    <WikiBrowsingPanel
      entries={records}
      worldId="world"
      section={section}
      disabled={disabled}
      filters={filters}
      onChange={onChange}
      onSelect={select}
    />
  );
}
async function render(props: ComponentProps<typeof Harness> = {}) {
  await act(() => root.render(<Harness {...props} />));
}
function field(label: string) {
  return [...container.querySelectorAll('label')]
    .find((el) => el.textContent?.startsWith(label))!
    .querySelector('input,select') as HTMLInputElement;
}
async function choose(label: string, value: string) {
  await act(() => {
    field(label).value = value;
    field(label).dispatchEvent(new Event('change', { bubbles: true }));
  });
}
async function search(value: string) {
  await act(() => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value'
    )!.set!.call(field('searchWiki'), value);
    field('searchWiki').dispatchEvent(new Event('input', { bubbles: true }));
  });
}
function cards() {
  return [...container.querySelectorAll('.wiki-entry-card')];
}
it('combines publication/tag facets, reports results, and recovers from an empty result', async () => {
  await render();
  expect(cards()).toHaveLength(2);
  await choose('wikiPublicationFilter', 'published');
  expect(cards()).toHaveLength(1);
  expect(cards()[0]!.textContent).toContain('Public entry');
  await choose('wikiTagFilter', 'story');
  expect(cards()).toHaveLength(0);
  expect(container.querySelector('[role=status]')!.textContent).toBe(
    'wikiEntryCount:0'
  );
  await act(() =>
    [...container.querySelectorAll('button')]
      .find((el) => el.textContent === 'clearFilters')!
      .click()
  );
  expect(cards()).toHaveLength(2);
});
it('searches saved body text and retains the selected card action', async () => {
  await render();
  await search('saved words');
  expect(cards()).toHaveLength(1);
  await act(() => (cards()[0] as HTMLButtonElement).click());
  expect(select).toHaveBeenCalledWith('entry-0');
});
it('keeps browsing and selection disabled while an editor has unsaved changes', async () => {
  await render({ disabled: true });
  expect(
    [...container.querySelectorAll('input,select,button')].every(
      (el) => (el as HTMLInputElement).disabled
    )
  ).toBe(true);
  await act(() => (cards()[0] as HTMLButtonElement).click());
  expect(select).not.toHaveBeenCalled();
});
it('hides card sorting for timeline and relationship views', async () => {
  await render({ section: 'timeline' });
  expect(container.textContent).not.toContain('wikiSort');
  await render({ section: 'relationships' });
  expect(container.textContent).not.toContain('wikiSort');
});
it('shows saved-change badges only on the explicit creator surface', async () => {
  const changed = {
    ...entries[1]!,
    draft: { ...entries[1]!.draft, description: 'Saved new description' },
  };
  await act(() =>
    root.render(
      <WikiBrowser
        entries={[changed]}
        section="pages"
        onSelect={select}
        disabled={false}
      />
    )
  );
  expect(container.textContent).not.toContain('wikiSavedChanges');
  await act(() =>
    root.render(
      <WikiBrowser
        entries={[changed]}
        section="pages"
        onSelect={select}
        disabled={false}
        showDraftChanges
      />
    )
  );
  expect(container.textContent).toContain('wikiSavedChanges');
});

it('counts relationship label matches and hides edges with filtered endpoints', async () => {
  const records = structuredClone(entries);
  records[0]!.draft.wiki = {
    aliases: [],
    facts: [],
    relationships: [
      { targetId: records[1]!.id, kind: 'related', label: 'Special bond' },
    ],
  };
  await render({ section: 'relationships', records });
  await search('special bond');
  expect(container.querySelectorAll('.wiki-connection')).toHaveLength(1);
  expect(container.querySelector('[role=status]')!.textContent).toBe(
    'wikiRelationshipCount:1'
  );
  await choose('wikiPublicationFilter', 'private');
  expect(container.querySelectorAll('.wiki-connection')).toHaveLength(0);
  expect(container.querySelector('[role=status]')!.textContent).toBe(
    'wikiRelationshipCount:0'
  );
});
it('reorders cards and applies saved-change facets to published entries', async () => {
  const records = structuredClone(entries);
  records[1]!.draft.description = 'New saved description';
  await render({ records });
  await choose('wikiSort', 'titleDesc');
  expect(cards()[0]!.textContent).toContain('Public entry');
  await choose('wikiPublicationFilter', 'changed');
  expect(cards()).toHaveLength(1);
  expect(cards()[0]!.textContent).toContain('wikiSavedChanges');
});
