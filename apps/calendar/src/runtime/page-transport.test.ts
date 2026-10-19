import { dehydrate, hydrate, QueryClient } from '@tanstack/react-query';
import { describe, expect, expectTypeOf, it } from 'vitest';
import type { loadCalendarPage } from './page-loader';
import type { CalendarPageModel } from './page-model.server';
import {
  boardsTransportState,
  pageTaskEmbedding,
  schedulingTaskTransport,
} from './page-transport';

const schedulingTask = {
  id: 'task',
  name: 'Task',
  board_id: 'board',
  list_id: 'list',
  closed_at: null,
  completed: false,
  completed_at: null,
  created_at: '2026-10-19T00:00:00Z',
  creator_id: 'actor',
  deleted_at: null,
  description: 'Keep every field',
  description_yjs_state: [1, 2],
  display_number: 7,
  embedding: [0.1, 0.2],
  end_date: null,
  estimation_points: 3,
  fts: "'calendar':1",
  priority: null,
  sort_key: 1,
  start_date: null,
  calendar_hours: { monday: [9, 17] },
  assignees: [{ id: 'actor', display_name: 'Owner' }],
};

describe('native page transport boundaries', () => {
  it('retains the actual Start response type required by native route consumers', () => {
    expectTypeOf<
      Awaited<ReturnType<typeof loadCalendarPage>>
    >().toMatchTypeOf<CalendarPageModel>();
  });
  it.each([null, undefined, '[0.1,0.2]', [0.1, 0.2], { vector: [1, 2] }])(
    'preserves the complete supported embedding value %j',
    (value) => expect(pageTaskEmbedding(value)).toEqual(value)
  );
  it('rejects unsupported embedding values rather than dropping the field', () => {
    expect(() => pageTaskEmbedding(() => 'hidden')).toThrow();
    expect(() => pageTaskEmbedding(Number.POSITIVE_INFINITY)).toThrow();
  });
  it.each([undefined, null, "'calendar':1", { lexemes: ['calendar'] }])(
    'preserves canonical scheduling task fields and search vector %j',
    (fts) => {
      const task = { ...schedulingTask, fts };
      expect(schedulingTaskTransport(task)).toEqual(task);
    }
  );
  it.each([() => 'hidden', Number.POSITIVE_INFINITY, Symbol('fts')])(
    'rejects an unsupported search vector before transport',
    (fts) =>
      expect(() =>
        schedulingTaskTransport({ ...schedulingTask, fts })
      ).toThrow()
  );
  it('keeps the embedding guard active in the canonical task adapter', () => {
    expect(() =>
      schedulingTaskTransport({ ...schedulingTask, embedding: () => 1 })
    ).toThrow();
  });
  it('preserves boards data, query identity, timing and status through hydration', () => {
    const client = new QueryClient();
    const key = ['boards', 'workspace', 'query', '1', '10'];
    const data = {
      boards: [{ id: 'board', name: 'Board', archived_at: null }],
      count: 1,
    };
    client.setQueryData(key, data);
    const before = dehydrate(client);
    const state = boardsTransportState(before);
    expect(state.queries[0]?.queryKey).toEqual(key);
    expect(state.queries[0]?.state).toEqual(before.queries[0]?.state);
    const restored = new QueryClient();
    hydrate(restored, state);
    expect(restored.getQueryData(key)).toEqual(data);
    expect(state.queries[0]?.state.data).toEqual(data);
    expect(state.queries[0]?.queryHash).toBe(before.queries[0]?.queryHash);
    client.clear();
    restored.clear();
  });
  it('rejects a nonserializable value in the actual dehydrated cache data', () => {
    const client = new QueryClient();
    client.setQueryData(['boards'], { hidden: () => 'not transport data' });
    expect(() => boardsTransportState(dehydrate(client))).toThrow();
    client.clear();
  });
});
