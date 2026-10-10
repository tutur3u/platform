import { expect, it } from 'vitest';
import {
  getLettinNotebookReferenceUrl,
  getLettinTaskPlanUrl,
} from '../lettin-task-reference';

const worldId = '00000000-0000-4000-8000-000000000001';
const entryId = '00000000-0000-4000-8000-000000000002';
const reference = { workspaceId: 'personal', worldId, entryId, locale: 'vi' };
it('hands off only canonical IDs in the same workspace and locale', () => {
  const url = new URL(getLettinTaskPlanUrl(reference)!);
  expect(url.origin).toBe('https://tasks.tuturuuu.com');
  expect(url.pathname).toBe('/vi/personal/tasks/new');
  expect([...url.searchParams.entries()]).toEqual([
    ['lettinWorld', worldId],
    ['lettinEntry', entryId],
  ]);
});
it('links back to the private wiki selection rather than publishing it', () => {
  const url = new URL(getLettinNotebookReferenceUrl(reference)!);
  expect(url.origin).toBe('https://lettin.tuturuuu.com');
  expect(url.pathname).toBe(`/vi/personal/wiki/${worldId}/overview`);
  expect(url.searchParams.get('entry')).toBe(entryId);
  const world = new URL(
    getLettinNotebookReferenceUrl({ ...reference, entryId: undefined })!
  );
  expect(world.searchParams.get('entry')).toBe(worldId);
  expect(
    new URL(
      getLettinTaskPlanUrl({ ...reference, entryId: undefined })!
    ).searchParams.has('lettinEntry')
  ).toBe(false);
});
it.each([
  { workspaceId: 'https://example.com' },
  { workspaceId: '../private' },
  { worldId: 'title with private text' },
  { entryId: '' },
  { entryId: '<script>' },
  { locale: '../en' },
  { locale: 'en?token=private' },
])('rejects malformed or injected reference segments %j', (patch) => {
  expect(getLettinTaskPlanUrl({ ...reference, ...patch })).toBeNull();
  expect(getLettinNotebookReferenceUrl({ ...reference, ...patch })).toBeNull();
});
it.each(['internal', 'personal', worldId])(
  'supports canonical workspace routes %s',
  (workspaceId) => {
    expect(getLettinTaskPlanUrl({ ...reference, workspaceId })).not.toBeNull();
  }
);
