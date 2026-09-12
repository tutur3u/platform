import { describe, expect, it } from 'vitest';
import type { MiraToolContext } from '../mira-tool-types';
import {
  executeSetSidebar,
  executeSetTheme,
  executeShowWorkspaceArtifact,
} from './theme';

const ctx = {
  wsId: 'dashboard-workspace',
  workspaceContext: { wsId: 'selected-workspace' },
} as MiraToolContext;
describe('Mira UI tool markers', () => {
  it('uses the selected data workspace rather than the dashboard workspace', async () => {
    expect(
      await executeShowWorkspaceArtifact({ kind: 'tasks', layout: 'grid' }, ctx)
    ).toEqual({
      success: true,
      action: 'show_workspace_artifact',
      kind: 'tasks',
      layout: 'grid',
      wsId: 'selected-workspace',
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
