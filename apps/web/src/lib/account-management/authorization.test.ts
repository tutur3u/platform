import { describe, expect, it, vi } from 'vitest';
import { authorizeHuman, type HumanAuthority } from './authorization';

const human = {
  actorId: '00000000-0000-4000-8000-000000000001',
  sessionId: '00000000-0000-4000-8000-000000000002',
  verifiedClaims: { aal: 'aal2', amr: [{ method: 'totp', timestamp: 1000 }] },
};
function authority(): HumanAuthority {
  return {
    hasRootRolePermission: vi.fn(async () => true),
    hasEnabledPlatformRole: vi.fn(async () => true),
    hasFreshTotpStepUp: vi.fn(async () => false),
  };
}

describe('human accounts authorization', () => {
  it('requires both live admin predicates and rejects a revoked role on the next call', async () => {
    const access = authority();
    await expect(authorizeHuman(human, access, 1000)).resolves.toMatchObject({
      actorId: human.actorId,
    });
    vi.mocked(access.hasEnabledPlatformRole).mockResolvedValue(false);
    await expect(authorizeHuman(human, access, 1000)).rejects.toMatchObject({
      status: 403,
    });
    expect(access.hasEnabledPlatformRole).toHaveBeenCalledTimes(2);
    vi.mocked(access.hasEnabledPlatformRole).mockResolvedValue(true);
    vi.mocked(access.hasRootRolePermission).mockResolvedValue(false);
    await expect(authorizeHuman(human, access, 1000)).rejects.toMatchObject({
      status: 403,
    });
  });

  it('rejects generic, phone and recovery proofs without a server TOTP record', async () => {
    for (const claims of [
      { mfa: { verifiedAt: 1000 } },
      { aal: 'aal2', amr: [{ method: 'mfa/phone', timestamp: 1000 }] },
      { aal: 'aal2', amr: [{ method: 'mfa/recovery_code', timestamp: 1000 }] },
    ]) {
      await expect(
        authorizeHuman({ ...human, verifiedClaims: claims }, authority(), 1000)
      ).rejects.toMatchObject({ code: 'step_up_required' });
    }
  });

  it('checks the exact actor and session when fresh provider AMR is unavailable', async () => {
    const access = authority();
    vi.mocked(access.hasFreshTotpStepUp).mockResolvedValue(true);
    await expect(
      authorizeHuman({ ...human, verifiedClaims: {} }, access, 1000)
    ).resolves.toMatchObject({ actorId: human.actorId });
    expect(access.hasFreshTotpStepUp).toHaveBeenCalledWith(
      human.actorId,
      human.sessionId
    );
  });
});
