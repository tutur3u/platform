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
  it('treats an absent declaration as no UI effects', () => {
    expect([...resolveMiraClientCapabilities(undefined)]).toEqual([]);
    expect(isMiraToolAvailableToClient('set_theme', undefined)).toBe(false);
    expect(isMiraToolAvailableToClient('create_task', undefined)).toBe(true);
  });

  it('exposes no UI tools to clients that omit a declaration', async () => {
    const tools = toolsFor();
    for (const name of [
      'set_theme',
      'set_sidebar',
      'show_workspace_artifact',
      'manage_workspace',
      'set_immersive_mode',
      'open_app',
    ]) {
      expect(tools).not.toHaveProperty(name);
    }
    expect(tools).toHaveProperty('create_task');
    const search = tools.search_tools?.execute as (input: {
      query: string;
    }) => Promise<{ matches: { name: string }[] }>;
    const names = (
      await search({ query: 'dark theme sidebar panel' })
    ).matches.map((match) => match.name);
    expect(names).not.toContain('set_theme');
    expect(names).not.toContain('show_workspace_artifact');
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

  it('offers each UI tool only to clients that declare its effect', () => {
    expect(toolsFor(['navigate'])).toHaveProperty('open_app');
    expect(toolsFor(['navigate'])).not.toHaveProperty('set_theme');
    expect(toolsFor(['artifact_panels'])).toHaveProperty(
      'show_workspace_artifact'
    );
  });

  it('tells Mira which effects are unavailable', () => {
    expect(buildMiraClientCapabilityInstruction(undefined)).toContain(
      'theme, sidebar, artifact_panels, immersive, navigate'
    );
    expect(
      buildMiraClientCapabilityInstruction(
        resolveMiraClientCapabilities([
          'theme',
          'sidebar',
          'artifact_panels',
          'immersive',
          'navigate',
        ])
      )
    ).toBe('');
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
