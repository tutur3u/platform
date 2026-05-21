import { describe, expect, it, vi } from 'vitest';
import { DELETE } from './route';

const mocks = vi.hoisted(() => ({
  resolveTopicAnnouncementsAccess: vi.fn(),
}));

vi.mock('../../shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../shared')>();
  return {
    ...actual,
    resolveTopicAnnouncementsAccess: mocks.resolveTopicAnnouncementsAccess,
  };
});

function createQueryChain(result: unknown) {
  const chain: {
    eq: ReturnType<typeof vi.fn>;
    maybeSingle: ReturnType<typeof vi.fn>;
    select: ReturnType<typeof vi.fn>;
  } = {
    eq: vi.fn(() => chain),
    maybeSingle: vi.fn(async () => ({ data: result, error: null })),
    select: vi.fn(() => chain),
  };

  return chain;
}

function createUpdateChain(result: unknown) {
  const chain: {
    eq: ReturnType<typeof vi.fn>;
    maybeSingle: ReturnType<typeof vi.fn>;
    select: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  } = {
    eq: vi.fn(() => chain),
    maybeSingle: vi.fn(async () => ({ data: result, error: null })),
    select: vi.fn(() => chain),
    update: vi.fn(() => chain),
  };

  return chain;
}

function setupAccess({ existingStatus }: { existingStatus: string }) {
  const existingChain = createQueryChain({
    id: 'announcement-1',
    status: existingStatus,
  });
  const updateChain = createUpdateChain({ id: 'announcement-1' });
  const sbAdmin = {
    from: vi
      .fn()
      .mockReturnValueOnce(existingChain)
      .mockReturnValueOnce(updateChain),
  };

  mocks.resolveTopicAnnouncementsAccess.mockResolvedValue({
    context: {
      actorUserId: 'user-1',
      normalizedWsId: 'workspace-1',
      sbAdmin,
    },
  });

  return { existingChain, sbAdmin, updateChain };
}

function params() {
  return {
    params: Promise.resolve({
      announcementId: 'announcement-1',
      wsId: 'workspace-1',
    }),
  };
}

describe('topic announcement DELETE route', () => {
  it.each([
    'draft',
    'queued',
  ])('soft-cancels %s announcements and clears pending delivery state', async (existingStatus) => {
    const { updateChain } = setupAccess({ existingStatus });

    const response = await DELETE(new Request('http://localhost'), params());

    expect(response.status).toBe(204);
    expect(updateChain.update).toHaveBeenCalledWith({
      last_error: null,
      scheduled_send_at: null,
      status: 'cancelled',
      updated_by: 'user-1',
    });
  });

  it('rejects sent announcements', async () => {
    const { sbAdmin } = setupAccess({ existingStatus: 'sent' });

    const response = await DELETE(new Request('http://localhost'), params());

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      message: 'Sent announcements cannot be removed',
    });
    expect(sbAdmin.from).toHaveBeenCalledTimes(1);
  });
});
