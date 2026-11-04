import type { JSONContent } from '@tiptap/react';
import { describe, expect, it } from 'vitest';
import {
  ALL_COMPARABLE_FIELDS,
  type ComparableField,
  type CurrentTaskState,
  formatDateForDisplay,
  getChangedFields,
  getFieldDisplayInfo,
  getPriorityLabel,
  getRelationshipDiff,
  isDescriptionEqual,
  type TaskSnapshot,
} from '../task-snapshot';

const t = (key: string, options?: { defaultValue?: string }) =>
  options?.defaultValue ?? key;

const doc = (text: string): JSONContent => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});

const baseSnapshot = (): TaskSnapshot => ({
  id: 'task-1',
  name: 'Write report',
  description: null,
  priority: 'normal',
  start_date: '2025-03-01T00:00:00.000Z',
  end_date: '2025-03-10T00:00:00.000Z',
  estimation_points: 3,
  list_id: 'list-1',
  completed: false,
  assignees: [{ id: 'row-1', user_id: 'user-1', display_name: 'Ada' }],
  labels: [{ id: 'label-1', name: 'Bug' }],
  projects: [{ id: 'project-1', name: 'Apollo' }],
});

const baseCurrent = (): CurrentTaskState => ({
  id: 'task-1',
  name: 'Write report',
  description: null,
  priority: 'normal',
  start_date: '2025-03-01T00:00:00.000Z',
  end_date: '2025-03-10T00:00:00.000Z',
  estimation_points: 3,
  list_id: 'list-1',
  completed: false,
  assignees: [{ user_id: 'user-1' }],
  labels: [{ id: 'label-1' }],
  projects: [{ id: 'project-1' }],
});

describe('ALL_COMPARABLE_FIELDS', () => {
  it('lists every comparable field exactly once', () => {
    expect(new Set(ALL_COMPARABLE_FIELDS).size).toBe(
      ALL_COMPARABLE_FIELDS.length
    );
    expect(ALL_COMPARABLE_FIELDS).toEqual([
      'name',
      'description',
      'priority',
      'start_date',
      'end_date',
      'estimation_points',
      'list_id',
      'completed',
      'assignees',
      'labels',
      'projects',
    ]);
  });
});

describe('isDescriptionEqual', () => {
  it.each<
    [
      string,
      string | JSONContent | null | undefined,
      string | JSONContent | null | undefined,
      boolean,
    ]
  >([
    ['null and null', null, null, true],
    ['undefined and null', undefined, null, true],
    ['empty string and null', '', null, true],
    ['null and a string', null, 'text', false],
    ['a string and undefined', 'text', undefined, false],
    ['equal plain strings', 'hello', 'hello', true],
    ['different plain strings', 'hello', 'world', false],
    ['equal documents', doc('hi'), doc('hi'), true],
    ['different documents', doc('hi'), doc('bye'), false],
    [
      'a JSON string and its parsed document',
      JSON.stringify(doc('hi')),
      doc('hi'),
      true,
    ],
    [
      'two equal JSON strings',
      JSON.stringify(doc('hi')),
      JSON.stringify(doc('hi')),
      true,
    ],
    [
      'a JSON string and a different document',
      JSON.stringify(doc('hi')),
      doc('bye'),
      false,
    ],
    ['an invalid JSON string and a document', 'not json', doc('hi'), false],
    ['two different invalid JSON strings', '{oops', '{nope', false],
  ])('compares %s', (_label, a, b, expected) => {
    expect(isDescriptionEqual(a, b)).toBe(expected);
  });
});

describe('getChangedFields', () => {
  it('returns no fields when snapshot and current state match', () => {
    expect(getChangedFields(baseSnapshot(), baseCurrent())).toEqual([]);
  });

  it.each<[ComparableField, Partial<CurrentTaskState>]>([
    ['name', { name: 'Renamed' }],
    ['description', { description: doc('new') }],
    ['priority', { priority: 'high' }],
    ['priority', { priority: null }],
    ['start_date', { start_date: '2025-03-02T00:00:00.000Z' }],
    ['start_date', { start_date: null }],
    ['end_date', { end_date: '2025-04-01T00:00:00.000Z' }],
    ['end_date', { end_date: null }],
    ['estimation_points', { estimation_points: 5 }],
    ['estimation_points', { estimation_points: null }],
    ['list_id', { list_id: 'list-2' }],
    ['completed', { completed: true }],
    ['assignees', { assignees: [{ user_id: 'user-2' }] }],
    ['assignees', { assignees: [] }],
    ['assignees', { assignees: undefined }],
    ['labels', { labels: [{ id: 'label-2' }] }],
    ['labels', { labels: [{ id: 'label-1' }, { id: 'label-2' }] }],
    ['projects', { projects: [] }],
    ['projects', { projects: undefined }],
  ])('reports %s when current is %j', (field, override) => {
    expect(
      getChangedFields(baseSnapshot(), { ...baseCurrent(), ...override })
    ).toEqual([field]);
  });

  it('reports several changed fields in declaration order', () => {
    const current: CurrentTaskState = {
      ...baseCurrent(),
      projects: [],
      name: 'Renamed',
      completed: true,
      list_id: 'list-9',
    };
    expect(getChangedFields(baseSnapshot(), current)).toEqual([
      'name',
      'list_id',
      'completed',
      'projects',
    ]);
  });

  it('treats equivalent date representations as equal', () => {
    const current = {
      ...baseCurrent(),
      start_date: '2025-03-01T07:00:00+07:00',
      end_date: '2025-03-10T00:00:00Z',
    };
    expect(getChangedFields(baseSnapshot(), current)).toEqual([]);
  });

  it('compares unparseable dates by their raw strings', () => {
    const snapshot = { ...baseSnapshot(), start_date: 'not-a-date' };
    const same = { ...baseCurrent(), start_date: 'not-a-date' };
    expect(getChangedFields(snapshot, same)).toEqual([]);
    const different = { ...baseCurrent(), start_date: 'also-not-a-date' };
    expect(getChangedFields(snapshot, different)).toEqual(['start_date']);
  });

  it('compares assignees by user_id first and id second', () => {
    const snapshot = {
      ...baseSnapshot(),
      assignees: [
        { id: 'user-a', display_name: 'A' },
        { id: 'row-b', user_id: 'user-b', display_name: 'B' },
      ],
    };
    const same = {
      ...baseCurrent(),
      assignees: [{ id: 'user-a' }, { user_id: 'user-b' }],
    };
    expect(getChangedFields(snapshot, same)).toEqual([]);
    const different = {
      ...same,
      assignees: [{ id: 'user-a' }, { id: 'row-b' }],
    };
    expect(getChangedFields(snapshot, different)).toEqual(['assignees']);
  });

  it('ignores relationship ordering and duplicates', () => {
    const snapshot = {
      ...baseSnapshot(),
      labels: [
        { id: 'l1', name: 'One' },
        { id: 'l2', name: 'Two' },
      ],
    };
    const current = {
      ...baseCurrent(),
      labels: [{ id: 'l2' }, { id: 'l1' }, { id: 'l1' }],
    };
    expect(getChangedFields(snapshot, current)).toEqual([]);
  });
});

describe('getFieldDisplayInfo', () => {
  const icons = {
    FileText: 'FileText',
    Flag: 'Flag',
    Clock: 'Clock',
    Calendar: 'Calendar',
    Target: 'Target',
    Layers: 'Layers',
    CheckCircle2: 'CheckCircle2',
    Users: 'Users',
    Tag: 'Tag',
    FolderKanban: 'FolderKanban',
  } as unknown as Parameters<typeof getFieldDisplayInfo>[2];

  it.each<[ComparableField, string, string, string]>([
    ['name', 'Name', 'FileText', 'core'],
    ['description', 'Description', 'FileText', 'core'],
    ['priority', 'Priority', 'Flag', 'core'],
    ['start_date', 'Start Date', 'Clock', 'dates'],
    ['end_date', 'Due Date', 'Calendar', 'dates'],
    ['estimation_points', 'Estimation', 'Target', 'core'],
    ['list_id', 'List', 'Layers', 'core'],
    ['completed', 'Completed', 'CheckCircle2', 'core'],
    ['assignees', 'Assignees', 'Users', 'relationships'],
    ['labels', 'Labels', 'Tag', 'relationships'],
    ['projects', 'Projects', 'FolderKanban', 'relationships'],
  ])('describes %s', (field, label, icon, category) => {
    expect(getFieldDisplayInfo(field, t, icons)).toEqual({
      label,
      icon,
      category,
    });
  });

  it('passes translation keys through the translator', () => {
    const keys: string[] = [];
    getFieldDisplayInfo(
      'name',
      (key, options) => {
        keys.push(key);
        return `translated:${options?.defaultValue}`;
      },
      icons
    );
    expect(keys).toContain('field.name');
    expect(getFieldDisplayInfo('name', () => 'x', icons).label).toBe('x');
  });

  it('describes every comparable field', () => {
    for (const field of ALL_COMPARABLE_FIELDS) {
      const info = getFieldDisplayInfo(field, t, icons);
      expect(info.label).not.toBe('');
      expect(['core', 'dates', 'relationships']).toContain(info.category);
    }
  });
});

describe('getPriorityLabel', () => {
  it.each<[Parameters<typeof getPriorityLabel>[0], string]>([
    [null, 'None'],
    ['low', 'Low'],
    ['normal', 'Normal'],
    ['high', 'High'],
    ['critical', 'Critical'],
  ])('labels %j as %s', (priority, expected) => {
    expect(getPriorityLabel(priority, t)).toBe(expected);
  });

  it('falls back to the raw value for an unknown priority', () => {
    expect(getPriorityLabel('urgent' as unknown as 'low', t)).toBe('urgent');
  });

  it('uses translated labels when the translator provides them', () => {
    expect(getPriorityLabel('high', (key) => `<${key}>`)).toBe(
      '<priority.high>'
    );
    expect(getPriorityLabel(null, (key) => `<${key}>`)).toBe('<priority.none>');
  });
});

describe('formatDateForDisplay', () => {
  it.each<[string | null | undefined]>([[null], [undefined], ['']])(
    'returns a dash for %j',
    (value) => {
      expect(formatDateForDisplay(value)).toBe('-');
    }
  );

  it('formats a valid date with the default English locale', () => {
    const iso = new Date(2025, 2, 15, 9, 5).toISOString();
    const out = formatDateForDisplay(iso);
    expect(out).toContain('Mar');
    expect(out).toContain('15');
    expect(out).toContain('2025');
    expect(out).toBe(
      new Date(iso).toLocaleDateString('en', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    );
  });

  it('honours an explicit locale', () => {
    const iso = new Date(2025, 2, 15, 9, 5).toISOString();
    expect(formatDateForDisplay(iso, 'de')).toBe(
      new Date(iso).toLocaleDateString('de', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    );
  });

  it('shows an invalid date string as the localized invalid-date text', () => {
    expect(formatDateForDisplay('not-a-date')).toBe('Invalid Date');
  });

  it('returns the raw string when the locale is rejected', () => {
    expect(formatDateForDisplay('2025-03-15T00:00:00Z', 'not a locale!!')).toBe(
      '2025-03-15T00:00:00Z'
    );
  });
});

describe('getRelationshipDiff', () => {
  it.each<
    [
      string,
      { id: string; name?: string }[],
      { id: string; name?: string }[],
      { added: string[]; removed: string[]; unchanged: string[] },
    ]
  >([
    ['two empty lists', [], [], { added: [], removed: [], unchanged: [] }],
    [
      'only additions',
      [],
      [{ id: 'a' }, { id: 'b' }],
      { added: ['a', 'b'], removed: [], unchanged: [] },
    ],
    [
      'only removals',
      [{ id: 'a' }],
      [],
      { added: [], removed: ['a'], unchanged: [] },
    ],
    [
      'identical lists',
      [{ id: 'a' }, { id: 'b' }],
      [{ id: 'b' }, { id: 'a' }],
      { added: [], removed: [], unchanged: ['a', 'b'] },
    ],
    [
      'a mix of changes',
      [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      [{ id: 'b' }, { id: 'd' }],
      { added: ['d'], removed: ['a', 'c'], unchanged: ['b'] },
    ],
  ])('splits %s', (_label, snapshotItems, currentItems, expected) => {
    const result = getRelationshipDiff(snapshotItems, currentItems);
    expect({
      added: result.added.map((i) => i.id),
      removed: result.removed.map((i) => i.id),
      unchanged: result.unchanged.map((i) => i.id),
    }).toEqual(expected);
  });

  it('keeps the snapshot version of unchanged items and the current version of added ones', () => {
    const result = getRelationshipDiff(
      [{ id: 'a', name: 'old name' }],
      [
        { id: 'a', name: 'new name' },
        { id: 'b', name: 'fresh' },
      ]
    );
    expect(result.unchanged).toEqual([{ id: 'a', name: 'old name' }]);
    expect(result.added).toEqual([{ id: 'b', name: 'fresh' }]);
  });
});
