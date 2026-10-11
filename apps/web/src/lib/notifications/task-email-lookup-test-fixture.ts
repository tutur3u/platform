import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { vi } from 'vitest';

const currentTaskResult = {
  data: {
    id: 'task-1',
    end_date: null,
    task_lists: { workspace_boards: { ws_id: ROOT_WORKSPACE_ID } },
  },
  error: null,
};

/** Legacy delivery tests use a current tenant-bound task without a due date. */
export function createCurrentTaskLookupFixture<T>(
  createChain: (result: typeof currentTaskResult) => T
) {
  return { select: vi.fn(() => createChain(currentTaskResult)) };
}

export function createResolvedChain<T>(result: T) {
  const chain = Promise.resolve(result) as Promise<T> & {
    eq: ReturnType<typeof vi.fn>;
    in: ReturnType<typeof vi.fn>;
    limit: ReturnType<typeof vi.fn>;
    maybeSingle: ReturnType<typeof vi.fn>;
    order: ReturnType<typeof vi.fn>;
    range: ReturnType<typeof vi.fn>;
    select: ReturnType<typeof vi.fn>;
    single: ReturnType<typeof vi.fn>;
  };
  chain.eq = vi.fn(() => chain);
  chain.in = vi.fn(() => chain);
  chain.limit = vi.fn(() => Promise.resolve(result));
  chain.maybeSingle = vi.fn(() => Promise.resolve(result));
  chain.order = vi.fn(() => chain);
  chain.range = vi.fn(() => Promise.resolve(result));
  chain.select = vi.fn(() => chain);
  chain.single = vi.fn(() => Promise.resolve(result));
  return chain;
}
