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
          toolResults: [
            {
              toolName: 'set_workspace_context',
              output: {
                success: true,
                workspaceContextId: '00000000-0000-0000-0000-000000000000',
              },
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

  it('keeps forcing workspace resolution until set_workspace_context succeeds', () => {
    const result = prepareMiraToolStep({
      steps: [
        {
          toolCalls: [
            {
              toolName: 'select_tools',
              args: { tools: ['create_time_tracking_entry'] },
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
          toolResults: [
            {
              toolName: 'list_accessible_workspaces',
              output: {
                workspaces: [{ id: 'zeus-id', name: 'Zeus' }],
              },
            },
          ],
        },
        {
          toolCalls: [
            {
              toolName: 'set_workspace_context',
              args: { workspaceId: 'Zeus' },
            },
          ],
          toolResults: [
            {
              toolName: 'set_workspace_context',
              output: {
                error:
                  'Workspace name "Zeus" is ambiguous. Use the workspace ID instead.',
              },
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
