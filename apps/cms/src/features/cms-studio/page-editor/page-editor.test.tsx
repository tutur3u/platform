// @vitest-environment jsdom

import type {
  ExternalProjectBlock,
  ExternalProjectPublishEvent,
} from '@tuturuuu/types';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PageEditorLabels } from './page-editor-labels';
import {
  historyItemsForEntry,
  orderSectionsForEntry,
  type PageEditorSection,
  sectionMoveUpdates,
} from './page-editor-model';
import { PageEditorShell } from './page-editor-shell';
import { PageEditorTopBar } from './page-editor-top-bar';
import { SaveStateIndicator } from './save-state-indicator';
import { SectionOutline } from './section-outline';
import { VersionHistoryPanel } from './version-history-panel';

afterEach(cleanup);

const labels: PageEditorLabels = {
  outlineTitle: 'Sections',
  inspectorTitle: 'Settings',
  historyTitle: 'History',
  showOutline: 'Show sections',
  showInspector: 'Show settings',
  untitledSection: (n) => `Section ${n}`,
  sectionType: (type) => `Type ${type}`,
  selectSection: (title) => `Edit ${title}`,
  moveSectionUp: (title) => `Move ${title} up`,
  moveSectionDown: (title) => `Move ${title} down`,
  duplicateSection: (title) => `Duplicate ${title}`,
  deleteSection: (title) => `Delete ${title}`,
  addSection: 'Add section',
  emptyOutline: 'No sections yet',
  saveSaved: 'Saved',
  saveSaving: 'Saving',
  saveUnsaved: 'Unsaved changes',
  saveFailed: 'Could not save',
  retrySave: 'Retry',
  historyEmpty: 'Nothing published yet',
  historyKind: (kind) => `kind:${kind}`,
  historyBy: (by) => `by ${by}`,
  restoreVersion: (when) => `Restore ${when}`,
};

const block = (
  over: Partial<ExternalProjectBlock> & Pick<ExternalProjectBlock, 'id'>
): ExternalProjectBlock => ({
  block_type: 'markdown',
  content: {},
  created_at: '2026-11-10T00:00:00Z',
  created_by: null,
  entry_id: 'entry-1',
  sort_order: 0,
  stable_source_id: null,
  title: null,
  updated_at: '2026-11-10T00:00:00Z',
  updated_by: null,
  ws_id: 'ws-1',
  ...over,
});

const sections: PageEditorSection[] = [
  { id: 'a', title: 'Hero', blockType: 'hero', sortOrder: 0 },
  { id: 'b', title: null, blockType: 'markdown', sortOrder: 1 },
  { id: 'c', title: 'Contact', blockType: 'cta', sortOrder: 2 },
];

describe('page editor model', () => {
  it("orders only this entry's sections by sort_order, then creation", () => {
    const ordered = orderSectionsForEntry(
      [
        block({ id: 'late', sort_order: 2 }),
        block({ id: 'other', entry_id: 'entry-2', sort_order: 0 }),
        block({
          id: 'tie-b',
          sort_order: 1,
          created_at: '2026-11-10T02:00:00Z',
        }),
        block({
          id: 'tie-a',
          sort_order: 1,
          created_at: '2026-11-10T01:00:00Z',
        }),
        block({ id: 'first', sort_order: 0, title: 'Hero' }),
      ],
      'entry-1'
    );
    expect(ordered.map((s) => s.id)).toEqual([
      'first',
      'tie-a',
      'tie-b',
      'late',
    ]);
    expect(ordered[0]).toEqual({
      id: 'first',
      title: 'Hero',
      blockType: 'markdown',
      sortOrder: 0,
    });
  });

  it('swaps sort_order with the neighbour, and refuses at either end', () => {
    expect(sectionMoveUpdates(sections, 'b', 'up')).toEqual([
      { id: 'b', sortOrder: 0 },
      { id: 'a', sortOrder: 1 },
    ]);
    expect(sectionMoveUpdates(sections, 'b', 'down')).toEqual([
      { id: 'b', sortOrder: 2 },
      { id: 'c', sortOrder: 1 },
    ]);
    expect(sectionMoveUpdates(sections, 'a', 'up')).toBeNull();
    expect(sectionMoveUpdates(sections, 'c', 'down')).toBeNull();
    expect(sectionMoveUpdates(sections, 'missing', 'up')).toBeNull();
  });

  it('broken variant: equal sort_order values still produce a real swap', () => {
    const tied = sections.map((s) => ({ ...s, sortOrder: 5 }));
    const updates = sectionMoveUpdates(tied, 'b', 'up');
    expect(updates).toEqual([
      { id: 'b', sortOrder: 0 },
      { id: 'a', sortOrder: 1 },
    ]);
    expect(updates?.[0]?.sortOrder).not.toBe(updates?.[1]?.sortOrder);
  });

  it("lists this entry's publish events newest first", () => {
    const event = (
      id: string,
      at: string,
      entry: string | null = 'entry-1'
    ): ExternalProjectPublishEvent => ({
      canonical_external_project_id: 'p',
      created_at: at,
      entry_id: entry,
      event_kind: 'publish',
      id,
      payload: {},
      profile_data: {},
      triggered_by: 'user-1',
      visibility_scope: 'public',
      ws_id: 'ws-1',
    });
    const items = historyItemsForEntry(
      [
        event('old', '2026-11-09T00:00:00Z'),
        event('elsewhere', '2026-11-10T05:00:00Z', 'entry-2'),
        event('new', '2026-11-10T00:00:00Z'),
      ],
      'entry-1'
    );
    expect(items.map((i) => i.id)).toEqual(['new', 'old']);
  });
});

describe('SectionOutline', () => {
  it('names each section, marks the selected one and selects on click', () => {
    const onSelect = vi.fn();
    render(
      <SectionOutline
        sections={sections}
        selectedId="b"
        labels={labels}
        onSelect={onSelect}
      />
    );
    expect(screen.getByRole('navigation', { name: 'Sections' })).toBeTruthy();
    const untitled = screen.getByRole('button', { name: 'Edit Section 2' });
    expect(untitled.getAttribute('aria-current')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Edit Contact' }));
    expect(onSelect).toHaveBeenCalledWith('c');
  });

  it('renders no reorder, duplicate, delete or add control without a handler', () => {
    render(
      <SectionOutline
        sections={sections}
        selectedId={null}
        labels={labels}
        onSelect={() => undefined}
      />
    );
    for (const name of [/^Move /, /^Duplicate /, /^Delete /, /^Add section$/])
      expect(screen.queryAllByRole('button', { name })).toHaveLength(0);
  });

  it('moves with buttons and Alt+Arrow, disabled at the ends and while pending', () => {
    const onMove = vi.fn();
    render(
      <SectionOutline
        sections={sections}
        selectedId={null}
        labels={labels}
        onSelect={() => undefined}
        onMove={onMove}
        pendingIds={new Set(['c'])}
      />
    );
    const up = (t: string) =>
      screen.getByRole('button', { name: `Move ${t} up` });
    const down = (t: string) =>
      screen.getByRole('button', { name: `Move ${t} down` });
    expect((up('Hero') as HTMLButtonElement).disabled).toBe(true);
    expect((down('Contact') as HTMLButtonElement).disabled).toBe(true);
    expect((up('Contact') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(down('Hero'));
    expect(onMove).toHaveBeenLastCalledWith('a', 'down');
    fireEvent.keyDown(screen.getByRole('button', { name: 'Edit Section 2' }), {
      key: 'ArrowUp',
      altKey: true,
    });
    expect(onMove).toHaveBeenLastCalledWith('b', 'up');
    fireEvent.keyDown(screen.getByRole('button', { name: 'Edit Section 2' }), {
      key: 'ArrowUp',
    });
    expect(onMove).toHaveBeenCalledTimes(2);
  });

  it('wires add, duplicate and delete when the data layer supports them', () => {
    const onAdd = vi.fn();
    const onDuplicate = vi.fn();
    const onDelete = vi.fn();
    render(
      <SectionOutline
        sections={sections}
        selectedId={null}
        labels={labels}
        onSelect={() => undefined}
        onAdd={onAdd}
        onDuplicate={onDuplicate}
        onDelete={onDelete}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Add section' }));
    fireEvent.click(screen.getByRole('button', { name: 'Duplicate Hero' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete Contact' }));
    expect(onAdd).toHaveBeenCalledOnce();
    expect(onDuplicate).toHaveBeenCalledWith('a');
    expect(onDelete).toHaveBeenCalledWith('c');
  });

  it('shows the empty state with no sections', () => {
    render(
      <SectionOutline
        sections={[]}
        selectedId={null}
        labels={labels}
        onSelect={() => undefined}
      />
    );
    expect(screen.getByText('No sections yet')).toBeTruthy();
  });
});

describe('SaveStateIndicator', () => {
  it('announces a failed save and retries in place', () => {
    const onRetry = vi.fn();
    render(
      <SaveStateIndicator
        state={{ kind: 'error', message: 'Network down' }}
        labels={labels}
        onRetry={onRetry}
      />
    );
    expect(screen.getByRole('alert').textContent).toContain('Could not save');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('offers no retry when the caller cannot retry', () => {
    render(
      <SaveStateIndicator
        state={{ kind: 'error', message: 'x' }}
        labels={labels}
      />
    );
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  });

  it('reports saving, unsaved and saved politely', () => {
    const { rerender } = render(
      <SaveStateIndicator state={{ kind: 'saving' }} labels={labels} />
    );
    expect(screen.getByRole('status').textContent).toContain('Saving');
    rerender(
      <SaveStateIndicator state={{ kind: 'unsaved' }} labels={labels} />
    );
    expect(screen.getByRole('status').textContent).toContain('Unsaved changes');
    rerender(<SaveStateIndicator state={{ kind: 'saved' }} labels={labels} />);
    expect(screen.getByRole('status').textContent).toContain('Saved');
  });
});

describe('VersionHistoryPanel', () => {
  const items = [
    {
      id: 'e1',
      kind: 'publish' as const,
      at: '2026-11-10T01:00:00Z',
      by: 'An',
    },
    {
      id: 'e2',
      kind: 'unpublish' as const,
      at: '2026-11-09T01:00:00Z',
      by: null,
    },
  ];

  it('lists events with no restore control unless restore is supported', () => {
    render(
      <VersionHistoryPanel
        items={items}
        labels={labels}
        formatDate={(d) => d}
      />
    );
    expect(screen.getByText('kind:publish')).toBeTruthy();
    expect(screen.getByText('by An')).toBeTruthy();
    expect(screen.queryAllByRole('button', { name: /^Restore / })).toHaveLength(
      0
    );
  });

  it('wires restore when a restore interface is supplied', () => {
    const onRestore = vi.fn();
    render(
      <VersionHistoryPanel
        items={items}
        labels={labels}
        formatDate={(d) => d}
        onRestore={onRestore}
      />
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Restore 2026-11-09T01:00:00Z' })
    );
    expect(onRestore).toHaveBeenCalledWith('e2');
  });

  it('shows the empty state', () => {
    render(
      <VersionHistoryPanel items={[]} labels={labels} formatDate={(d) => d} />
    );
    expect(screen.getByText('Nothing published yet')).toBeTruthy();
  });
});

describe('PageEditorTopBar', () => {
  it('renders only the page actions it is given', () => {
    const onPublish = vi.fn();
    const onBack = vi.fn();
    render(
      <PageEditorTopBar
        labels={labels}
        title="AI handbook"
        context="Library"
        status={{ label: 'Draft', live: false }}
        saveState={{ kind: 'unsaved' }}
        backLabel="Back"
        onBack={onBack}
        publish={{ label: 'Publish', pending: false, onPublish }}
        moreActionsLabel="More actions"
      />
    );
    expect(screen.getByRole('heading', { name: 'AI handbook' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Preview/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'More actions' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(onPublish).toHaveBeenCalledOnce();
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('disables publish while it is pending', () => {
    render(
      <PageEditorTopBar
        labels={labels}
        title="AI handbook"
        status={{ label: 'Live', live: true }}
        saveState={{ kind: 'saved' }}
        backLabel="Back"
        onBack={() => undefined}
        publish={{
          label: 'Publish',
          pending: true,
          onPublish: () => undefined,
        }}
        moreActionsLabel="More actions"
        actions={[
          { id: 'dup', label: 'Duplicate page', onSelect: () => undefined },
        ]}
      />
    );
    const publish = screen.getByRole('button', { name: 'Publish' });
    expect((publish as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'More actions' })).toBeTruthy();
  });
});

describe('PageEditorShell', () => {
  it('mounts each panel once and toggles the inspector on narrow screens', () => {
    render(
      <PageEditorShell
        labels={labels}
        topBar={<div>top</div>}
        outline={<div>outline-body</div>}
        canvas={<div>canvas-body</div>}
        inspector={<div>inspector-body</div>}
        history={<div>history-body</div>}
      />
    );
    for (const text of [
      'outline-body',
      'canvas-body',
      'inspector-body',
      'history-body',
    ])
      expect(screen.getAllByText(text)).toHaveLength(1);
    const toggle = screen.getByRole('button', { name: /Show settings/ });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(
      screen
        .getByRole('button', { name: /Show sections/ })
        .getAttribute('aria-expanded')
    ).toBe('true');
  });
});
