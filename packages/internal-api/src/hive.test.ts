import { describe, expect, it, vi } from 'vitest';
import {
  archiveHiveWorkflow,
  createHiveResearchSession,
  createHiveWorkflow,
  exportHiveResearchSession,
  getHiveAiCredits,
  getHiveWorkflowRun,
  listHiveAiModels,
  listHiveResearchSessions,
  listHiveTimeline,
  listHiveWorkflowRuns,
  listHiveWorkflows,
  listHiveWorkspaces,
  runHiveNpcInteraction,
  runHivePairQueue,
  runHiveWorkflow,
  updateHiveResearchSession,
  updateHiveWorkflow,
} from './hive';

function createFetchMock(response: unknown = { ok: true }) {
  return vi.fn().mockResolvedValue({
    json: async () => response,
    ok: true,
    status: 200,
    text: async () => JSON.stringify(response),
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

describe('Hive AI context internal API helpers', () => {
  it('targets workspace, credit, model, interaction, and timeline routes', async () => {
    const fetch = createFetchMock({
      models: [],
      personalWorkspaceId: 'personal-ws',
      workspaces: [],
    });
    const options = {
      baseUrl: 'https://internal.example.com',
      fetch: fetch as unknown as typeof globalThis.fetch,
    };

    await listHiveWorkspaces(options);
    await getHiveAiCredits('workspace-1', options);
    await listHiveAiModels(options);
    await runHiveNpcInteraction(
      'server-1',
      {
        creditSource: 'workspace',
        creditWsId: 'workspace-1',
        expectedRevision: 8,
        model: 'google/gemini-2.5-flash-lite',
        prompt: 'Discuss the garden.',
        sourceNpcId: 'npc-1',
        targetNpcId: 'npc-2',
        world: { blocks: [], objects: [] },
      },
      options
    );
    await listHiveTimeline('server-1', options);
    await listHiveTimeline(
      'server-1',
      { limit: 50, researchSessionId: 'session-1', trigger: 'manual' },
      options
    );

    expect(fetch.mock.calls.map(([url, init]) => [url, init?.method])).toEqual([
      ['https://internal.example.com/api/v1/hive/workspaces', undefined],
      [
        'https://internal.example.com/api/v1/hive/ai/credits?wsId=workspace-1',
        undefined,
      ],
      [
        'https://internal.example.com/api/v1/hive/ai/models?enabled=true&type=language',
        undefined,
      ],
      [
        'https://internal.example.com/api/v1/hive/servers/server-1/interactions',
        'POST',
      ],
      [
        'https://internal.example.com/api/v1/hive/servers/server-1/timeline',
        undefined,
      ],
      [
        'https://internal.example.com/api/v1/hive/servers/server-1/timeline?limit=50&researchSessionId=session-1&trigger=manual',
        undefined,
      ],
    ]);
  });
});

describe('Hive research session internal API helpers', () => {
  it('targets session, export, and pair queue routes', async () => {
    const fetch = createFetchMock({ sessions: [] });
    const options = {
      baseUrl: 'https://internal.example.com',
      fetch: fetch as unknown as typeof globalThis.fetch,
    };

    await listHiveResearchSessions('server-1', options);
    await createHiveResearchSession(
      'server-1',
      { name: 'Session A', status: 'running' },
      options
    );
    await updateHiveResearchSession(
      'server-1',
      'session-1',
      { status: 'completed' },
      options
    );
    await exportHiveResearchSession('server-1', 'session-1', 'json', options);
    await exportHiveResearchSession('server-1', 'session-1', 'jsonl', options);
    await runHivePairQueue(
      'server-1',
      'session-1',
      {
        expectedRevision: 8,
        pairs: [{ sourceNpcId: 'npc-1', targetNpcId: 'npc-2' }],
        world: { blocks: [], objects: [] },
      },
      options
    );

    expect(fetch.mock.calls.map(([url, init]) => [url, init?.method])).toEqual([
      [
        'https://internal.example.com/api/v1/hive/servers/server-1/research-sessions',
        undefined,
      ],
      [
        'https://internal.example.com/api/v1/hive/servers/server-1/research-sessions',
        'POST',
      ],
      [
        'https://internal.example.com/api/v1/hive/servers/server-1/research-sessions/session-1',
        'PATCH',
      ],
      [
        'https://internal.example.com/api/v1/hive/servers/server-1/research-sessions/session-1/export?format=json',
        undefined,
      ],
      [
        'https://internal.example.com/api/v1/hive/servers/server-1/research-sessions/session-1/export?format=jsonl',
        undefined,
      ],
      [
        'https://internal.example.com/api/v1/hive/servers/server-1/research-sessions/session-1/run-pair-queue',
        'POST',
      ],
    ]);
  });
});
