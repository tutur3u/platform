import { describe, expect, it, vi } from 'vitest';
import { requirePersonalCreditWorkspace } from './personal-workspace';

const userId = '00000000-0000-4000-8000-00000000c201';
const personalId = '00000000-0000-4000-8000-00000000c202';
const foreignUserId = '00000000-0000-4000-8000-00000000c203';
function personalWorkspace(creatorId = userId, members = [userId]) {
  return {
    id: personalId,
    creator_id: creatorId,
    personal: true,
    workspace_members: members.map((id) => ({ user_id: id })),
  };
}

describe('personal citation credit workspace', () => {
  it('resolves from the authenticated actor rather than a requested billing workspace', async () => {
    const lookup = vi.fn(async (_actorId: string) => personalWorkspace());
    expect(await requirePersonalCreditWorkspace(userId, lookup)).toBe(
      personalId
    );
    expect(lookup).toHaveBeenCalledExactlyOnceWith(userId);
  });
  it('fails closed for missing, invalid or failed personal pool lookups', async () => {
    await expect(
      requirePersonalCreditWorkspace(userId, async () => null)
    ).rejects.toMatchObject({
      code: 'PERSONAL_WORKSPACE_NOT_FOUND',
      status: 403,
    });
    await expect(
      requirePersonalCreditWorkspace(userId, async () => ({
        ...personalWorkspace(),
        id: 'invalid',
      }))
    ).rejects.toMatchObject({ code: 'PERSONAL_WORKSPACE_UNAVAILABLE' });
    await expect(
      requirePersonalCreditWorkspace(userId, async () => {
        throw new Error('private DB detail');
      })
    ).rejects.toMatchObject({ message: 'PERSONAL_WORKSPACE_UNAVAILABLE' });
  });
  it('rejects invalid actor identity without querying a pool', async () => {
    const lookup = vi.fn(async () => personalWorkspace());
    await expect(
      requirePersonalCreditWorkspace('invalid', lookup)
    ).rejects.toMatchObject({ code: 'INVALID_ACTOR', status: 401 });
    expect(lookup).not.toHaveBeenCalled();
  });

  it('refuses another creator personal pool even when the actor is its member', async () => {
    const candidates = [
      personalWorkspace(foreignUserId, [userId, foreignUserId]),
    ];
    const membershipOnlyLookup = async (actorId: string) =>
      candidates.find((candidate) =>
        candidate.workspace_members.some((member) => member.user_id === actorId)
      ) ?? null;
    await expect(
      requirePersonalCreditWorkspace(userId, membershipOnlyLookup)
    ).rejects.toMatchObject({
      code: 'PERSONAL_WORKSPACE_NOT_FOUND',
      status: 403,
    });
  });

  it('requires membership in addition to personal workspace ownership', async () => {
    await expect(
      requirePersonalCreditWorkspace(userId, async () =>
        personalWorkspace(userId, [foreignUserId])
      )
    ).rejects.toMatchObject({
      code: 'PERSONAL_WORKSPACE_NOT_FOUND',
      status: 403,
    });
  });
});
