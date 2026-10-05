import type { MiraToolContext } from '@tuturuuu/ai/tools/mira-tools';
import { createMiraStreamTools } from '@tuturuuu/ai/tools/mira-tools';
import { describe, expect, it, vi } from 'vitest';
import { runCanonicalLiveTool } from './canonical-tool-bridge';

describe('canonical Live bridge with the real registry factory', () => {
  it('hides denied wallet discovery and rejects execution before data access', async () => {
    const from = vi.fn(() => {
      throw new Error('Denied tool touched storage');
    });
    const ctx = {
      userId: 'actor',
      wsId: 'workspace',
      supabase: { from },
      authorizeWorkspaceTools: async () => false,
    } as unknown as MiraToolContext;
    const tools = createMiraStreamTools(ctx, () => true);
    const discovery = await runCanonicalLiveTool(
      tools,
      'search_workspace_tools',
      { query: 'wallet', limit: 8 },
      'discovery'
    );
    expect(discovery).toHaveProperty('matches');
    expect(JSON.stringify(discovery)).not.toContain('"name":"list_wallets"');
    const execution = await runCanonicalLiveTool(
      tools,
      'execute_workspace_tool',
      { toolName: 'list_wallets', argumentsJson: '{}' },
      'execution'
    );
    expect(execution).toHaveProperty('error');
    expect(from).not.toHaveBeenCalled();
  });
});
