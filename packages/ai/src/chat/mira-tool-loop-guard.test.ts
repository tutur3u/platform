import { describe, expect, it } from 'vitest';
import { prepareMiraToolStep } from './google/mira-step-preparation';
import { getMiraToolLoopReason } from './mira-tool-loop-guard';

const step = (
  toolName: string,
  input: unknown = {},
  output: unknown = { success: true }
) => ({
  toolCalls: [{ toolName, toolCallId: 'call', input }],
  toolResults: [{ toolName, toolCallId: 'call', output }],
});

describe('Mira repeated tool protection', () => {
  it('treats native server searches as reads rather than mutations', () => {
    expect(
      getMiraToolLoopReason([
        step('select_tools', { tools: ['google_search'] }),
        step('server:GOOGLE_SEARCH_WEB', { query: 'Calendar help' }),
        step('select_tools', { tools: ['google_search'] }),
      ])
    ).toContain('Repeated completed action');
  });
  it('ends the select/context cycle with a text response even when workspace resolution is required', () => {
    const steps = [
      step('select_tools', { tools: ['get_workspace_context'] }),
      step('get_workspace_context'),
      step('select_tools', { tools: ['get_workspace_context'] }),
    ];
    expect(
      prepareMiraToolStep({
        steps,
        forceGoogleSearch: false,
        forceRenderUi: false,
        needsParallelChecks: false,
        needsWorkspaceContextResolution: true,
        needsWorkspaceMembersTool: false,
        preferMarkdownTables: false,
      })
    ).toEqual({ toolChoice: 'none', activeTools: [] });
  });
  it('recognizes equivalent arguments regardless of object key order', () => {
    expect(
      getMiraToolLoopReason([
        step('get_my_tasks', { category: 'all', page: 1 }),
        step('get_my_tasks', { page: 1, category: 'all' }),
      ])
    ).toContain('Repeated completed action');
  });
  it('permits pagination and a read refreshed after a successful mutation', () => {
    expect(
      getMiraToolLoopReason([
        step('get_my_tasks', { page: 1 }),
        step('get_my_tasks', { page: 2 }),
        step('create_task', { name: 'Test' }),
        step('get_my_tasks', { page: 1 }),
      ])
    ).toBeNull();
  });
  it('does not treat a failed write as invalidating successful reads', () => {
    expect(
      getMiraToolLoopReason([
        step('get_my_tasks'),
        step('create_task', {}, { error: 'Denied' }),
        step('get_my_tasks'),
      ])
    ).not.toBeNull();
  });
  it('allows a bounded retry but stops the third identical failure', () => {
    const failed = step('create_task', {}, { success: false });
    expect(getMiraToolLoopReason([failed, failed])).toBeNull();
    expect(getMiraToolLoopReason([failed, failed, failed])).toContain(
      'Repeated failure'
    );
  });
});

it('does not let parallel verification re-enable a discovery loop', () => {
  expect(
    getMiraToolLoopReason([
      step('get_my_tasks'),
      step('run_parallel_checks'),
      step('get_my_tasks'),
    ])
  ).toContain('Repeated completed action');
});
it('resets prior failures after the same read succeeds', () => {
  const failed = step('get_my_tasks', {}, { success: false });
  expect(
    getMiraToolLoopReason([failed, step('get_my_tasks'), failed, failed])
  ).toBeNull();
});
