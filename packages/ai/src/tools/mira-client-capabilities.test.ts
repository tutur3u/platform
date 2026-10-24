import { describe, expect, it, vi } from 'vitest';
import {
  buildMiraClientCapabilityInstruction,
  isMiraToolAvailableToClient,
  resolveMiraClientCapabilities,
} from './mira-client-capabilities';
import type { MiraToolContext } from './mira-tool-types';
import { createMiraStreamTools } from './mira-tools';

vi.mock('./mira-tool-dispatcher', () => ({
  executeMiraTool: vi.fn(async () => ({ ok: true })),
}));

function toolsFor(clientCapabilities?: readonly string[]) {
  const ctx = {
    userId: 'user',
    wsId: 'workspace',
    supabase: {},
    clientCapabilities:
      clientCapabilities === undefined
        ? undefined
        : resolveMiraClientCapabilities(clientCapabilities),
  } as unknown as MiraToolContext;
  return createMiraStreamTools(ctx, () => false);
}

describe('Mira client capabilities', () => {
  it('keeps legacy Web effects for clients that do not declare any', () => {
    expect([...resolveMiraClientCapabilities(undefined)].sort()).toEqual([
      'artifact_panels',
      'immersive',
      'sidebar',
      'theme',
    ]);
  });

  it('ignores unknown names from newer clients', () => {
    expect([...resolveMiraClientCapabilities(['theme', 'hologram'])]).toEqual([
      'theme',
    ]);
  });

  it('only gates UI tools', () => {
    const none = resolveMiraClientCapabilities([]);
    expect(isMiraToolAvailableToClient('set_theme', none)).toBe(false);
    expect(isMiraToolAvailableToClient('open_app', none)).toBe(false);
    expect(isMiraToolAvailableToClient('create_task', none)).toBe(true);
    expect(isMiraToolAvailableToClient('google_search', none)).toBe(true);
  });

  it('omits undeclared UI tools from the registry and discovery', async () => {
    const tools = toolsFor(['theme']);
    expect(tools).toHaveProperty('set_theme');
    expect(tools).not.toHaveProperty('show_workspace_artifact');
    expect(tools).not.toHaveProperty('manage_workspace');
    expect(tools).not.toHaveProperty('set_sidebar');
    expect(tools).not.toHaveProperty('open_app');
    expect(tools).toHaveProperty('create_task');

    const search = tools.search_tools?.execute as (input: {
      query: string;
      limit?: number;
    }) => Promise<{ matches: { name: string }[] }>;
    const result = await search({ query: 'open artifact panel sidebar' });
    const names = result.matches.map((match) => match.name);
    expect(names).not.toContain('show_workspace_artifact');
    expect(names).not.toContain('set_sidebar');
  });

  it('offers open_app only to clients that navigate', () => {
    expect(toolsFor()).not.toHaveProperty('open_app');
    expect(toolsFor()).toHaveProperty('show_workspace_artifact');
    expect(toolsFor(['navigate'])).toHaveProperty('open_app');
  });

  it('tells Mira which effects are unavailable', () => {
    expect(buildMiraClientCapabilityInstruction(undefined)).toBe('');
    const mobile = buildMiraClientCapabilityInstruction(
      resolveMiraClientCapabilities(['theme', 'immersive', 'navigate'])
    );
    expect(mobile).toContain('sidebar, artifact_panels');
    expect(mobile).toContain('use open_app');
    const chatOnly = buildMiraClientCapabilityInstruction(
      resolveMiraClientCapabilities([])
    );
    expect(chatOnly).toContain('answer in chat');
    expect(chatOnly).not.toContain('use open_app');
  });
});
