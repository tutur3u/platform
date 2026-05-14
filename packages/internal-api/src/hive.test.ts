import { describe, expect, it, vi } from 'vitest';
import {
  archiveHiveWorkflow,
  createHiveWorkflow,
  getHiveWorkflowRun,
  listHiveWorkflowRuns,
  listHiveWorkflows,
  runHiveWorkflow,
  updateHiveWorkflow,
} from './hive';

function createFetchMock(response: unknown = { ok: true }) {
  return vi.fn().mockResolvedValue({
    json: async () => response,
    ok: true,
    status: 200,
  });
}

describe('Hive workflow internal API helpers', () => {
  it('targets the server-scoped workflow collection', async () => {
    const fetch = createFetchMock({ workflows: [] });

    await listHiveWorkflows('server-1', {
      baseUrl: 'https://internal.example.com',
      fetch: fetch as unknown as typeof globalThis.fetch,
    });

    expect(fetch).toHaveBeenCalledWith(
      'https://internal.example.com/api/v1/hive/servers/server-1/workflows',
      expect.objectContaining({ cache: 'no-store' })
    );
  });

  it('posts create, update, archive, and run requests to stable routes', async () => {
    const fetch = createFetchMock();
    const options = {
      baseUrl: 'https://internal.example.com',
      fetch: fetch as unknown as typeof globalThis.fetch,
    };
    const graph = { edges: [], nodes: [], version: 1 } as const;

    await createHiveWorkflow(
      'server-1',
      {
        definition: graph,
        description: null,
        enabled: true,
        name: 'Daily loop',
      },
      options
    );
    await updateHiveWorkflow(
      'server-1',
      'workflow-1',
      { definition: graph, name: 'Daily loop v2' },
      options
    );
    await archiveHiveWorkflow('server-1', 'workflow-1', options);
    await runHiveWorkflow(
      'server-1',
      'workflow-1',
      { input: { mode: 'now' } },
      options
    );
    await listHiveWorkflowRuns('server-1', 'workflow-1', options);
    await getHiveWorkflowRun('server-1', 'workflow-1', 'run-1', options);

    expect(fetch.mock.calls.map(([url, init]) => [url, init?.method])).toEqual([
      [
        'https://internal.example.com/api/v1/hive/servers/server-1/workflows',
        'POST',
      ],
      [
        'https://internal.example.com/api/v1/hive/servers/server-1/workflows/workflow-1',
        'PATCH',
      ],
      [
        'https://internal.example.com/api/v1/hive/servers/server-1/workflows/workflow-1',
        'DELETE',
      ],
      [
        'https://internal.example.com/api/v1/hive/servers/server-1/workflows/workflow-1/run',
        'POST',
      ],
      [
        'https://internal.example.com/api/v1/hive/servers/server-1/workflows/workflow-1/runs',
        undefined,
      ],
      [
        'https://internal.example.com/api/v1/hive/servers/server-1/workflows/workflow-1/runs/run-1',
        undefined,
      ],
    ]);
  });
});
