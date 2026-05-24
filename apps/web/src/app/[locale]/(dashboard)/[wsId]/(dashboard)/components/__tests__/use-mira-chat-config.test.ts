import { describe, expect, it } from 'vitest';
import { getEffectiveMiraWorkspaceContextId } from '../use-mira-chat-config';

describe('getEffectiveMiraWorkspaceContextId', () => {
  it('uses the current task-board workspace context when available', () => {
    expect(
      getEffectiveMiraWorkspaceContextId({
        taskBoardContext: {
          workspaceId: '00000000-0000-0000-0000-000000000000',
        },
        workspaceContextId: 'personal',
      })
    ).toBe('00000000-0000-0000-0000-000000000000');
  });

  it('falls back to the selected Mira workspace context outside task boards', () => {
    expect(
      getEffectiveMiraWorkspaceContextId({
        workspaceContextId: 'internal',
      })
    ).toBe('00000000-0000-0000-0000-000000000000');
  });
});
