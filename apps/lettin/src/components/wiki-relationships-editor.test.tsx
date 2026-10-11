// @vitest-environment jsdom
import type { LettinRecord, LettinWiki } from '@tuturuuu/internal-api/lettin';
import { act, type ComponentProps, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createStarterDraft } from './starter-drafts';
import { WikiDetailsEditor } from './wiki-details-editor';
import { WikiRelationshipsEditor } from './wiki-relationships-editor';

vi.mock('next-intl', () => ({
  useTranslations:
    () => (key: string, values?: Record<string, string | number>) =>
      values ? `${key}:${Object.values(values).join(':')}` : key,
}));
vi.mock('@tuturuuu/ui/button', () => ({
  Button: ({
    variant: _v,
    ...props
  }: ComponentProps<'button'> & { variant?: string }) => <button {...props} />,
}));
vi.mock('@tuturuuu/ui/input', () => ({
  Input: (props: ComponentProps<'input'>) => <input {...props} />,
}));
const make = (
  id: string,
  title = id,
  kind: 'character' | 'location' = 'character'
): LettinRecord => ({
  id,
  version: 1,
  published: null,
  published_at: null,
  draft: {
    ...createStarterDraft(title, 'blank', (key) => key),
    kind,
    wiki: { aliases: ['Alias'], facts: [], relationships: [] },
  },
});
const entries = [
  make('self'),
  make('a', 'Alice'),
  make('b', '<Castle>', 'location'),
];
const initial: LettinWiki = {
  aliases: [],
  facts: [],
  relationships: [{ targetId: 'a', kind: 'friend', label: 'Trusted label' }],
};
let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
const changes = vi.fn();
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  changes.mockClear();
});
afterEach(async () => {
  await act(() => root.unmount());
  container.remove();
});
function Harness({
  source = initial,
  records = entries,
}: {
  source?: LettinWiki;
  records?: LettinRecord[];
}) {
  const [wiki, setWiki] = useState(source);
  return (
    <WikiRelationshipsEditor
      wiki={wiki}
      entries={records}
      recordId="self"
      onChange={(next) => {
        changes(next);
        setWiki(next);
      }}
    />
  );
}
async function render(source = initial, records = entries) {
  await act(() => root.render(<Harness source={source} records={records} />));
}
const targets = () => [
  ...container.querySelectorAll<HTMLButtonElement>('ul button'),
];
async function select(index: number, value: string) {
  const el = container.querySelectorAll<HTMLSelectElement>('select')[index]!;
  await act(() => {
    el.value = value;
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
}
async function search(value: string) {
  const input = container.querySelectorAll<HTMLInputElement>('input')[1]!;
  await act(() => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value'
    )!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
it('requires an explicit target click after kind selection and updates only draft references', async () => {
  await render();
  await select(1, 'family');
  expect(changes).not.toHaveBeenCalled();
  await act(() =>
    targets()
      .find((b) => b.textContent?.includes('Alice'))!
      .click()
  );
  expect(changes.mock.lastCall?.[0].relationships).toEqual([
    ...initial.relationships,
    { targetId: 'a', kind: 'family', label: '' },
  ]);
  expect(targets().map((b) => b.textContent)).toEqual([
    '<Castle> · kindlocation',
  ]);
  expect(container.querySelector('castle')).toBeNull();
});
it('filters by title and alias plus entry kind and allows clearing the search', async () => {
  await render();
  await search('aLiCe');
  expect(targets()).toHaveLength(1);
  await search('alias');
  expect(targets()).toHaveLength(2);
  await select(2, 'location');
  expect(targets()[0]?.textContent).toContain('<Castle>');
  await search('absent');
  expect(targets()).toHaveLength(0);
  expect(container.querySelector('[role=status]')?.textContent).toBe(
    'relationshipTargetCount:0'
  );
  await search('');
  expect(targets()).toHaveLength(1);
  expect(changes).not.toHaveBeenCalled();
});
it('excludes current record and duplicate type targets while showing other types', async () => {
  await render();
  expect(targets().some((b) => b.textContent?.includes('self'))).toBe(false);
  await select(1, 'friend');
  expect(targets()).toHaveLength(1);
  await select(1, 'related');
  expect(targets()).toHaveLength(2);
});
it('disables conflicting kind options and rejects a synthetic conflicting change', async () => {
  await render({
    ...initial,
    relationships: [
      ...initial.relationships,
      { targetId: 'a', kind: 'family', label: 'Second' },
    ],
  });
  const option = container
    .querySelector<HTMLSelectElement>('select')!
    .querySelector<HTMLOptionElement>('option[value=family]')!;
  expect(option.disabled).toBe(true);
  await select(0, 'family');
  expect(changes).not.toHaveBeenCalled();
  await select(0, 'rival');
  expect(changes.mock.lastCall?.[0].relationships[0].label).toBe(
    'Trusted label'
  );
});
it('preserves unavailable targets until explicit remove and retains unrelated wiki fields', async () => {
  await render({
    ...initial,
    aliases: ['Keep'],
    facts: [{ label: 'Fact', value: 'Value' }],
    relationships: [
      { targetId: 'retired', kind: 'friend', label: 'Keep label' },
    ],
  });
  expect(container.textContent).toContain('unavailableEntry');
  expect(changes).not.toHaveBeenCalled();
  await act(() =>
    [...container.querySelectorAll<HTMLButtonElement>('button')]
      .find((b) => b.textContent === 'remove')!
      .click()
  );
  expect(changes.mock.lastCall?.[0]).toMatchObject({
    aliases: ['Keep'],
    facts: [{ label: 'Fact', value: 'Value' }],
    relationships: [],
  });
});
it('disables target addition at the cap but keeps removal available', async () => {
  await render({
    ...initial,
    relationships: Array.from({ length: 100 }, (_, i) => ({
      targetId: `old${i}`,
      kind: 'related',
      label: '',
    })),
  });
  expect(targets().every((b) => b.disabled)).toBe(true);
  expect(container.textContent).toContain('relationshipLimit');
  await act(() => targets()[0]!.click());
  expect(changes).not.toHaveBeenCalled();
  await act(() =>
    [...container.querySelectorAll<HTMLButtonElement>('button')]
      .find((b) => b.textContent === 'remove')!
      .click()
  );
  expect(targets().every((b) => !b.disabled)).toBe(true);
});
it('bounds rendered choices to 50 and resets expansion when filters change', async () => {
  await render(
    initial,
    Array.from({ length: 120 }, (_, i) => make(`new${i}`))
  );
  expect(targets()).toHaveLength(50);
  await act(() =>
    [...container.querySelectorAll<HTMLButtonElement>('button')]
      .find((b) => b.textContent === 'showMoreRelationshipTargets')!
      .click()
  );
  expect(targets()).toHaveLength(100);
  await search('Alias');
  expect(targets()).toHaveLength(50);
});
it('integrates draft changes through WikiDetailsEditor without losing chronology or facts', async () => {
  const wiki = {
    ...initial,
    chronology: { order: 5, era: 'Era', label: 'Date' },
    facts: [{ label: 'Fact', value: 'Value' }],
  };
  const draft = { ...entries[0]!.draft, wiki };
  await act(() =>
    root.render(
      <WikiDetailsEditor
        draft={draft}
        entries={entries}
        recordId="self"
        onChange={changes}
      />
    )
  );
  await act(() =>
    targets()
      .find((b) => b.textContent?.includes('<Castle>'))!
      .click()
  );
  expect(changes.mock.lastCall?.[0]).toMatchObject({
    chronology: wiki.chronology,
    facts: wiki.facts,
    relationships: [
      ...initial.relationships,
      { targetId: 'b', kind: 'related', label: '' },
    ],
  });
});

it('keeps the focused type control mounted when changing a relationship kind', async () => {
  await render();
  const control = container.querySelector<HTMLSelectElement>(
    '.wiki-relationship-row select'
  )!;
  control.focus();
  expect(document.activeElement).toBe(control);
  await select(0, 'rival');
  expect(container.querySelector('.wiki-relationship-row select')).toBe(
    control
  );
  expect(document.activeElement).toBe(control);
  expect(control.value).toBe('rival');
  expect(changes.mock.lastCall?.[0].relationships[0]).toMatchObject({
    kind: 'rival',
    label: 'Trusted label',
  });
});

it('preserves independently controlled legacy duplicate rows without duplicate keys', async () => {
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    await render({
      ...initial,
      relationships: [
        ...initial.relationships,
        { ...initial.relationships[0]!, label: 'Second label' },
      ],
    });
    expect(container.querySelectorAll('.wiki-relationship-row')).toHaveLength(
      2
    );
    expect(error.mock.calls.flat().join(' ')).not.toContain('same key');
    const controls = container.querySelectorAll<HTMLSelectElement>(
      '.wiki-relationship-row select'
    );
    controls[1]!.focus();
    await select(1, 'family');
    expect(container.querySelectorAll('.wiki-relationship-row select')[1]).toBe(
      controls[1]
    );
    expect(document.activeElement).toBe(controls[1]);
    expect(changes.mock.lastCall?.[0].relationships).toEqual([
      { targetId: 'a', kind: 'friend', label: 'Trusted label' },
      { targetId: 'a', kind: 'family', label: 'Second label' },
    ]);
  } finally {
    error.mockRestore();
  }
});
