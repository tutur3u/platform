import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const isPersonalWorkspace = vi.fn();
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  isPersonalWorkspace: (id: string) => isPersonalWorkspace(id),
}));

const {
  isActorPersonalWorkspace,
  NOT_PERSONAL_TTL_MS,
  resetPersonalWorkspaceChecks,
} = await import('./personal-workspace-check');

const WS = '86F5DD41-8305-42BA-A93D-820AFAA81C41';

describe('isActorPersonalWorkspace', () => {
  afterEach(() => {
    vi.useRealTimers();
  });
  beforeEach(() => {
    resetPersonalWorkspaceChecks();
    isPersonalWorkspace.mockReset().mockResolvedValue(false);
  });

  it('reads once per actor and workspace', async () => {
    await expect(isActorPersonalWorkspace('user-1', WS)).resolves.toBe(false);
    await isActorPersonalWorkspace('user-1', WS.toLowerCase());
    expect(isPersonalWorkspace).toHaveBeenCalledTimes(1);
  });

  it('reads a false answer again after its window, but keeps a true one', async () => {
    vi.useFakeTimers();
    isPersonalWorkspace
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    await isActorPersonalWorkspace('user-1', WS);
    vi.advanceTimersByTime(NOT_PERSONAL_TTL_MS + 1);
    await expect(isActorPersonalWorkspace('user-1', WS)).resolves.toBe(true);
    vi.advanceTimersByTime(NOT_PERSONAL_TTL_MS * 10);
    await expect(isActorPersonalWorkspace('user-1', WS)).resolves.toBe(true);
    expect(isPersonalWorkspace).toHaveBeenCalledTimes(2);
  });

  it('keeps answers separate per actor', async () => {
    isPersonalWorkspace.mockResolvedValueOnce(true);
    await expect(isActorPersonalWorkspace('owner', WS)).resolves.toBe(true);
    await expect(isActorPersonalWorkspace('other', WS)).resolves.toBe(false);
    expect(isPersonalWorkspace).toHaveBeenCalledTimes(2);
  });

  it('always reads without an actor', async () => {
    await isActorPersonalWorkspace(undefined, WS);
    await isActorPersonalWorkspace(null, WS);
    expect(isPersonalWorkspace).toHaveBeenCalledTimes(2);
  });

  it('does not remember a failed read', async () => {
    isPersonalWorkspace.mockRejectedValueOnce(new Error('offline'));
    await expect(isActorPersonalWorkspace('user-1', WS)).rejects.toThrow();
    await isActorPersonalWorkspace('user-1', WS);
    expect(isPersonalWorkspace).toHaveBeenCalledTimes(2);
  });
});
