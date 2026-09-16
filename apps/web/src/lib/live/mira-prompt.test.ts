import { buildMiraPrompt } from '@tuturuuu/ai/chat/mira-prompt';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildLiveMiraPrompt } from './mira-prompt';

const mocks = vi.hoisted(() => ({
  context: vi.fn(),
  permissions: vi.fn(),
  workspace: vi.fn(),
}));
vi.mock('@tuturuuu/ai/tools/context-builder', () => ({
  buildMiraContext: (...args: unknown[]) => mocks.context(...args),
}));
vi.mock('@tuturuuu/ai/tools/workspace-context', () => ({
  resolveWorkspaceContextState: (...args: unknown[]) =>
    mocks.workspace(...args),
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: (...args: unknown[]) => mocks.permissions(...args),
}));

const workspace = {
  wsId: 'workspace-1',
  workspaceContextId: 'workspace-1',
  name: 'My workspace',
  personal: true,
  memberCount: 1,
};
const supabase = {} as TypedSupabaseClient;
const user = { id: 'user-1' };

describe('Live Mira personalization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.workspace.mockResolvedValue(workspace);
    mocks.permissions.mockResolvedValue({ withoutPermission: () => false });
    mocks.context.mockResolvedValue({
      contextString:
        '## Memories\nUser studies physics. Speak Vietnamese slowly with a warm voice.',
      soul: {
        name: 'Chachipiki',
        tone: 'warm',
        chat_tone: 'detailed',
        personality: 'Patient tutor',
        boundaries: 'No spoilers',
      },
      isFirstInteraction: false,
    });
  });

  it.each([true, false])(
    'uses the exact Chat prompt before Live transport guidance (dashboard=%s)',
    async (dashboard) => {
      const chat = await buildMiraPrompt({
        supabase,
        userId: user.id,
        wsId: workspace.wsId,
        workspaceContext: workspace,
        withoutPermission: () => false,
      });
      const live = await buildLiveMiraPrompt({
        supabase,
        user,
        wsId: workspace.wsId,
        timezone: 'Asia/Ho_Chi_Minh',
        dashboard,
      });
      expect(live.startsWith(`${chat}\n\n## Live delivery`)).toBe(true);
      expect(live).toContain('You are Chachipiki');
      expect(live).toContain('Speak Vietnamese slowly with a warm voice');
      expect(live).toContain('User studies physics');
      expect(live).toContain('Patient tutor');
      expect(live).toContain('No spoilers');
      expect(live).not.toContain('You are Mira');
      expect(live).not.toContain('## First Interaction');
      expect(live.includes('Dashboard mutations')).toBe(dashboard);
      expect(mocks.context).toHaveBeenLastCalledWith(
        expect.objectContaining({
          supabase,
          userId: 'user-1',
          wsId: 'workspace-1',
          timezone: 'Asia/Ho_Chi_Minh',
        })
      );
      expect(mocks.workspace).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          requestedWorkspaceContextId: 'workspace-1',
          strict: true,
        })
      );
    }
  );

  it('denies permission-gated context when permission resolution returns no policy', async () => {
    mocks.permissions.mockResolvedValue(null);
    await buildLiveMiraPrompt({ supabase, user, wsId: workspace.wsId });
    const options = mocks.context.mock.calls[0]![0];
    expect(options.withoutPermission('manage_finance')).toBe(true);
    expect(options.withoutPermission('manage_calendar')).toBe(true);
  });

  it('does not read memories when workspace verification fails', async () => {
    mocks.workspace.mockRejectedValueOnce(new Error('Access denied'));
    await expect(
      buildLiveMiraPrompt({ supabase, user, wsId: 'other-workspace' })
    ).rejects.toThrow('Access denied');
    expect(mocks.context).not.toHaveBeenCalled();
  });

  it('fails provisioning instead of silently losing personalization on context failure', async () => {
    mocks.context.mockRejectedValueOnce(new Error('Memory unavailable'));
    await expect(
      buildLiveMiraPrompt({ supabase, user, wsId: workspace.wsId })
    ).rejects.toThrow('Memory unavailable');
  });
});
