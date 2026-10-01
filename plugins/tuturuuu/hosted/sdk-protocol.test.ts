import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { describe, expect, it } from 'vitest';
import { createSdkTransport } from '../../../apps/web/src/lib/mcp/sdk';
import {
  config,
  fixture,
  task,
  workspace,
} from '../../../apps/web/src/lib/mcp/workflow-fixtures';

// Actual installed official SDK client + server + Streamable HTTP transport.
// Only provider/API data and offline JOSE signing keys are synthetic. The SDK
// sends initialize, initialized notification, tools/list and tools/call itself.
async function connect() {
  const f = await fixture(createSdkTransport);
  const client = new Client({
    name: 'tuturuuu-offline-protocol-test',
    version: '0.1.0',
  });
  const requests: string[] = [];
  const transport = new StreamableHTTPClientTransport(
    new URL(config.resource),
    {
      requestInit: { headers: { Authorization: `Bearer ${f.token}` } },
      fetch: async (input, init) => {
        const request = new Request(input, init);
        if (request.method === 'POST')
          requests.push((await request.clone().json()).method);
        return f.handler(request);
      },
    }
  );
  await client.connect(transport);
  return { ...f, client, requests };
}

describe('official SDK1.31.0 stateless Streamable HTTP', () => {
  it('negotiates initialization and lists real typed read tools', async () => {
    const f = await connect();
    try {
      const result = await f.client.listTools();
      expect(f.requests).toContain('initialize');
      expect(f.requests).toContain('notifications/initialized');
      expect(f.requests).toContain('tools/list');
      expect(result.tools.map((tool) => tool.name)).toEqual([
        'list_workspaces',
        'list_workspace_tasks',
        'list_workspace_calendar',
        'get_workspace_navigation',
      ]);
      for (const tool of result.tools) {
        expect(tool.outputSchema?.type).toBe('object');
        expect(tool.annotations).toMatchObject({
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        });
      }
    } finally {
      await f.client.close();
    }
  });
  it('executes task and navigation calls through SDK, JWT, provider and internal-api, without leaking credentials', async () => {
    const f = await connect();
    try {
      const result = await f.client.callTool({
        name: 'list_workspace_tasks',
        arguments: { workspace_id: workspace, limit: 2 },
      });
      expect(result.isError).not.toBe(true);
      expect(result.structuredContent).toEqual({
        workspace_id: workspace,
        tasks: [{ id: task, name: 'Synthetic task' }],
        limit: 2,
        offset: 0,
      });
      expect(JSON.stringify(result)).not.toContain(f.token);
      expect(JSON.stringify(result)).not.toMatch(
        /Private description|private@example|providerAccessToken/u
      );
      const navigation = await f.client.callTool({
        name: 'get_workspace_navigation',
        arguments: { workspace_id: workspace, surface: 'tasks' },
      });
      expect(navigation.structuredContent).toEqual({
        workspace_id: workspace,
        surface: 'tasks',
        url: `https://tasks.tuturuuu.com/${workspace}/tasks`,
      });
      expect(
        f.requests.filter((method) => method === 'tools/call')
      ).toHaveLength(2);
    } finally {
      await f.client.close();
    }
  });
  it('rejects forged workspace and cross-tenant API results through the real SDK call path', async () => {
    const f = await connect();
    try {
      const forged = await f.client.callTool({
        name: 'list_workspace_tasks',
        arguments: { workspace_id: '33333333-3333-4333-8333-333333333333' },
      });
      expect(forged.isError).toBe(true);
      f.crossTenant();
      const wrong = await f.client.callTool({
        name: 'list_workspace_tasks',
        arguments: { workspace_id: workspace },
      });
      expect(wrong.isError).toBe(true);
      expect(JSON.stringify(wrong)).not.toContain('Synthetic task');
    } finally {
      await f.client.close();
    }
  });
});
