import { describe, expect, it } from 'vitest';
import { prepareMiraToolStep } from './mira-step-preparation';

describe('prepareMiraToolStep', () => {
  it('forces workspace resolution tools before task tools for explicit workspace requests', () => {
    const result = prepareMiraToolStep({
      steps: [
        {
          toolCalls: [
            {
              toolName: 'select_tools',
              args: { tools: ['get_my_tasks'] },
            },
          ],
        },
      ],
      forceGoogleSearch: false,
      forceRenderUi: false,
      needsWorkspaceContextResolution: true,
      needsWorkspaceMembersTool: false,
      preferMarkdownTables: false,
    });

    expect(result.toolChoice).toBe('required');
    expect(result.activeTools).toEqual([
      'list_accessible_workspaces',
      'get_workspace_context',
      'set_workspace_context',
      'select_tools',
    ]);
  });

  it('continues forcing workspace switch after listing accessible workspaces', () => {
    const result = prepareMiraToolStep({
      steps: [
        {
          toolCalls: [
            {
              toolName: 'select_tools',
              args: { tools: ['get_my_tasks'] },
            },
          ],
        },
        {
          toolCalls: [
            {
              toolName: 'list_accessible_workspaces',
              args: {},
            },
          ],
        },
      ],
      forceGoogleSearch: false,
      forceRenderUi: false,
      needsWorkspaceContextResolution: true,
      needsWorkspaceMembersTool: false,
      preferMarkdownTables: false,
    });

    expect(result.toolChoice).toBe('required');
    expect(result.activeTools).toEqual([
      'get_workspace_context',
      'set_workspace_context',
      'select_tools',
    ]);
  });

  it('returns to selected tools after workspace context has been switched', () => {
    const result = prepareMiraToolStep({
      steps: [
        {
          toolCalls: [
            {
              toolName: 'select_tools',
              args: { tools: ['get_my_tasks'] },
            },
          ],
        },
        {
          toolCalls: [
            {
              toolName: 'list_accessible_workspaces',
              args: {},
            },
          ],
        },
        {
          toolCalls: [
            {
              toolName: 'set_workspace_context',
              args: { workspaceId: '00000000-0000-0000-0000-000000000000' },
            },
          ],
        },
      ],
      forceGoogleSearch: false,
      forceRenderUi: false,
      needsWorkspaceContextResolution: true,
      needsWorkspaceMembersTool: false,
      preferMarkdownTables: false,
    });

    expect(result.activeTools).toContain('get_my_tasks');
  });

  it('forces the workspace members tool for member queries', () => {
    const result = prepareMiraToolStep({
      steps: [
        {
          toolCalls: [
            {
              toolName: 'select_tools',
              args: { tools: ['list_workspace_members'] },
            },
          ],
        },
      ],
      forceGoogleSearch: false,
      forceRenderUi: false,
      needsWorkspaceContextResolution: false,
      needsWorkspaceMembersTool: true,
      preferMarkdownTables: false,
    });

    expect(result.toolChoice).toBe('required');
    expect(result.activeTools).toEqual([
      'get_workspace_context',
      'list_workspace_members',
      'select_tools',
    ]);
  });
});
