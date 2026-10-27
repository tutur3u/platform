import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const send = vi.fn();
  const workspaceServiceFactory = vi.fn(async () => ({ send }));
  class MockEmailService {
    static fromWorkspace = workspaceServiceFactory;
  }
  return { send, EmailService: MockEmailService };
});
vi.mock('@react-email/render', () => ({
  render: vi.fn(async () => '<html />'),
}));
vi.mock('@tuturuuu/email-service', () => ({
  EmailService: mocks.EmailService,
}));
vi.mock(
  '@/app/[locale]/(dashboard)/[wsId]/mail/default-email-template',
  () => ({
    default: vi.fn(() => null),
  })
);

import {
  processPostEmailQueueBatch,
  sendPostEmailImmediately,
} from './batch-processing';
import {
  createCheckRow,
  createQueueRow,
  createSbAdminMock,
  GROUP_ID,
  POST_ID,
  QUEUE_ID,
  SENDER_PLATFORM_USER_ID,
  USER_ID,
  WS_ID,
} from './batch-test-utils';

const eligibleMembership = {
  group_id: GROUP_ID,
  user_id: USER_ID,
  ws_id: WS_ID,
};
const check = () =>
  createCheckRow({
    user_id: USER_ID,
    userEmail: 'recipient@example.test',
  });
type Fixture = ReturnType<typeof createSbAdminMock>;

async function send(
  mode: 'queued' | 'immediate',
  fixture: Fixture,
  scope = { wsId: WS_ID, groupId: GROUP_ID }
) {
  if (mode === 'queued') {
    const result = await processPostEmailQueueBatch(fixture.sbAdmin as never, {
      concurrency: 1,
      limit: 1,
      sendLimit: 1,
      maxDurationMs: 1000,
    });
    return result.results[0];
  }
  return sendPostEmailImmediately(fixture.sbAdmin as never, {
    ...scope,
    postId: POST_ID,
    userId: USER_ID,
    senderPlatformUserId: SENDER_PLATFORM_USER_ID,
  });
}

function expectNoDelivery(fixture: Fixture) {
  expect(mocks.send).not.toHaveBeenCalled();
  expect(fixture.sentEmailInsertMock).not.toHaveBeenCalled();
  expect(fixture.state.checkEmailUpdates).toEqual([]);
  expect(fixture.state.sentEmailRows).toEqual([]);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.send.mockResolvedValue({ success: true, messageId: 'fixture-message' });
});

for (const mode of ['queued', 'immediate'] as const) {
  describe(`${mode} participant delivery`, () => {
    const queueRows = () =>
      mode === 'queued'
        ? [createQueueRow({ id: QUEUE_ID, user_id: USER_ID })]
        : [];

    it.each([
      { label: 'departed', memberships: [] },
      {
        label: 'another group',
        memberships: [{ ...eligibleMembership, group_id: 'other-group' }],
      },
      {
        label: 'another workspace',
        memberships: [{ ...eligibleMembership, ws_id: 'other-workspace' }],
      },
    ])('cancels an approved $label recipient', async ({ memberships }) => {
      const fixture = createSbAdminMock({
        checkRows: [check()],
        queueRows: queueRows(),
        memberships,
      });
      expect(await send(mode, fixture)).toEqual({
        id: QUEUE_ID,
        status: 'cancelled',
      });
      expectNoDelivery(fixture);
    });

    it('does not trust a foreign user returned with a scoped membership', async () => {
      const row = check();
      if (!row.user) throw new Error('Missing fixture user');
      row.user.ws_id = 'other-workspace';
      const fixture = createSbAdminMock({
        checkRows: [row],
        queueRows: queueRows(),
        memberships: [eligibleMembership],
      });
      expect(await send(mode, fixture)).toEqual({
        id: QUEUE_ID,
        status: 'cancelled',
      });
      expectNoDelivery(fixture);
    });

    it.each([
      { wsId: 'other-workspace', groupId: GROUP_ID },
      { wsId: WS_ID, groupId: 'other-group' },
    ])(
      'cancels a queue scope different from the post ($wsId, $groupId)',
      async (scope) => {
        const fixture = createSbAdminMock({
          checkRows: [check()],
          queueRows:
            mode === 'queued'
              ? [
                  createQueueRow({
                    id: QUEUE_ID,
                    user_id: USER_ID,
                    ws_id: scope.wsId,
                    group_id: scope.groupId,
                  }),
                ]
              : [],
          memberships: [eligibleMembership],
        });
        expect(await send(mode, fixture, scope)).toEqual({
          id: QUEUE_ID,
          status: 'cancelled',
        });
        expectNoDelivery(fixture);
      }
    );

    it('fails closed when membership resolution fails', async () => {
      const fixture = createSbAdminMock({
        checkRows: [check()],
        queueRows: queueRows(),
        membershipError: true,
      });
      await expect(send(mode, fixture)).rejects.toMatchObject({
        message: 'Fixture membership lookup failed',
      });
      expectNoDelivery(fixture);
    });

    it('sends a current member and queries only the relevant scope', async () => {
      const fixture = createSbAdminMock({
        checkRows: [check()],
        queueRows: queueRows(),
        memberships: [eligibleMembership],
      });
      expect(await send(mode, fixture)).toEqual({
        id: QUEUE_ID,
        status: 'sent',
      });
      expect(mocks.send).toHaveBeenCalledTimes(1);
      expect(fixture.state.membershipReads).toEqual([
        {
          groupId: GROUP_ID,
          wsId: WS_ID,
          userIds: [USER_ID],
        },
      ]);
      expect(fixture.state.checkEmailUpdates).toHaveLength(1);
    });
  });
}

it('rechecks membership after approval and before queued delivery', async () => {
  const memberships = [{ ...eligibleMembership }];
  const fixture = createSbAdminMock({
    checkRows: [check()],
    queueRows: [createQueueRow({ id: QUEUE_ID, user_id: USER_ID })],
    memberships,
    onQueueUpdate: ({ patch }) => {
      if (patch.status === 'processing') memberships.splice(0);
    },
  });
  expect(await send('queued', fixture)).toEqual({
    id: QUEUE_ID,
    status: 'cancelled',
  });
  expectNoDelivery(fixture);
});
