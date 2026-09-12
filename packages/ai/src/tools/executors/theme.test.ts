import { describe, expect, it } from 'vitest';
import type { MiraToolContext } from '../mira-tool-types';
import {
  executeManageWorkspace,
  executeSetSidebar,
  executeSetTheme,
  executeShowWorkspaceArtifact,
} from './theme';

const ctx = {
  wsId: 'dashboard-workspace',
  workspaceContext: { wsId: 'selected-workspace' },
} as MiraToolContext;
describe('Mira UI tool markers', () => {
  it('validates management actions and keeps them in the selected workspace', async () => {
    expect(
      await executeManageWorkspace(
        { operation: 'focus_artifact', kind: 'tasks' },
        ctx
      )
    ).toMatchObject({
      success: true,
      wsId: 'selected-workspace',
      operation: 'focus_artifact',
      message: expect.stringContaining('Do not repeat'),
    });
    expect(
      await executeManageWorkspace({ operation: 'focus_artifact' }, ctx)
    ).toHaveProperty('error');
    expect(
      await executeManageWorkspace({ operation: 'set_layout' }, ctx)
    ).toHaveProperty('error');
    expect(
      await executeManageWorkspace({ operation: 'close_all' }, ctx)
    ).toMatchObject({ success: true, operation: 'close_all' });
  });
  it('accepts bounded presentation and rejects invalid dates', async () => {
    expect(
      await executeShowWorkspaceArtifact(
        {
          kind: 'calendar',
          presentation: { title: 'Plan Monday', date: '2026-09-14' },
        },
        ctx
      )
    ).toMatchObject({
      presentation: { title: 'Plan Monday', date: '2026-09-14' },
    });
    expect(
      await executeShowWorkspaceArtifact(
        { kind: 'calendar', presentation: { date: '2026-02-31' } },
        ctx
      )
    ).toHaveProperty('error');
  });
  it('uses the selected data workspace rather than the dashboard workspace', async () => {
    expect(
      await executeShowWorkspaceArtifact({ kind: 'tasks', layout: 'grid' }, ctx)
    ).toMatchObject({
      success: true,
      action: 'show_workspace_artifact',
      kind: 'tasks',
      layout: 'grid',
      wsId: 'selected-workspace',
      message: expect.stringMatching(
        /did not fetch product data.*Do not repeat/
      ),
    });
  });
  it('rejects malformed layout, artifact, sidebar, and theme values', async () => {
    expect(
      await executeShowWorkspaceArtifact(
        { kind: 'tasks', layout: 'invalid' },
        ctx
      )
    ).toHaveProperty('error');
    expect(
      await executeShowWorkspaceArtifact({ kind: 'unknown' }, ctx)
    ).toHaveProperty('error');
    expect(await executeSetSidebar({ behavior: 'invalid' })).toHaveProperty(
      'error'
    );
    expect(await executeSetTheme({ theme: 'invalid' }, ctx)).toHaveProperty(
      'error'
    );
  });
});
