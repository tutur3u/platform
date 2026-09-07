import { describe, expect, it, vi } from 'vitest';

vi.mock('@tuturuuu/ai/memory', () => ({
  withAiMemory: vi.fn(),
  resolveAiMemoryWorkspaceIdForUser: vi.fn(),
}));

import { allowedAutomaticLabels, autoLabelMessage } from './labels';

describe('automatic labels', () => {
  it('ignores invented IDs, duplicates, disabled labels, and manual-only labels', () => {
    expect(
      allowedAutomaticLabels(
        ['safe', 'safe', 'invented', 'manual', 'disabled'],
        [
          { id: 'safe', ai_enabled: true, ai_auto_apply: true },
          { id: 'manual', ai_enabled: true, ai_auto_apply: false },
          { id: 'disabled', ai_enabled: false, ai_auto_apply: true },
        ]
      )
    ).toEqual(['safe']);
  });
  it('does not read messages or call AI when not enabled', async () => {
    const schema = vi.fn();
    await autoLabelMessage(
      { schema },
      { created_by: 'owner', metadata: {} },
      { id: 'message' }
    );
    expect(schema).not.toHaveBeenCalled();
  });
  it('keeps delivery successful on enrichment failure', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(
      autoLabelMessage(
        {
          schema: () => {
            throw new Error('unavailable');
          },
        },
        {
          created_by: 'owner',
          metadata: { mail_automation: { smartLabelsEnabled: true } },
        },
        { id: 'message' }
      )
    ).resolves.toBeUndefined();
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
});
