import { dehydrate, hydrate, QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { boardsTransportState, pageTaskEmbedding } from './page-transport';

describe('native page transport boundaries', () => {
  it.each([null, undefined, '[0.1,0.2]', [0.1, 0.2], { vector: [1, 2] }])(
    'preserves the complete supported embedding value %j',
    (value) => expect(pageTaskEmbedding(value)).toEqual(value)
  );
  it('rejects unsupported embedding values rather than dropping the field', () => {
    expect(() => pageTaskEmbedding(() => 'hidden')).toThrow();
    expect(() => pageTaskEmbedding(Number.POSITIVE_INFINITY)).toThrow();
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
