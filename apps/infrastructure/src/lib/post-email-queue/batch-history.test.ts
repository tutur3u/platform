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
  expect(fixture.state.membershipReads).toEqual([]);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.send.mockResolvedValue({ success: true, messageId: 'fixture-message' });
});

for (const mode of ['queued', 'immediate'] as const) {
  describe(`${mode} post email history`, () => {
    const queueRows = (scope = { wsId: WS_ID, groupId: GROUP_ID }) =>
      mode === 'queued'
        ? [
            createQueueRow({
              id: QUEUE_ID,
              user_id: USER_ID,
              ws_id: scope.wsId,
              group_id: scope.groupId,
            }),
          ]
        : [];

    it.each([
      { label: 'no current membership', memberships: [] },
      {
        label: 'transferred to another group',
        memberships: [
          {
            group_id: 'other-group',
            user_id: USER_ID,
            ws_id: WS_ID,
          },
        ],
      },
    ])('delivers the approved check after $label', async ({ memberships }) => {
      const fixture = createSbAdminMock({
        checkRows: [check()],
        queueRows: queueRows(),
        memberships,
      });
      expect(await send(mode, fixture)).toEqual({
        id: QUEUE_ID,
        status: 'sent',
      });
      expect(mocks.send).toHaveBeenCalledTimes(1);
      expect(fixture.state.sentEmailRows).toEqual([
        expect.objectContaining({ receiver_id: USER_ID, ws_id: WS_ID }),
      ]);
      expect(fixture.state.checkEmailUpdates).toHaveLength(1);
      expect(fixture.state.membershipReads).toEqual([]);
    });

    it('does not query current membership during historical delivery', async () => {
      const fixture = createSbAdminMock({
        checkRows: [check()],
        queueRows: queueRows(),
        membershipError: true,
      });
      expect(await send(mode, fixture)).toEqual({
        id: QUEUE_ID,
        status: 'sent',
      });
      expect(mocks.send).toHaveBeenCalledTimes(1);
      expect(fixture.state.membershipReads).toEqual([]);
    });

    it('still refuses a recipient from another workspace', async () => {
      const row = check();
      if (!row.user) throw new Error('Missing fixture user');
      row.user.ws_id = 'other-workspace';
      const fixture = createSbAdminMock({
        checkRows: [row],
        queueRows: queueRows(),
        memberships: [],
      });
      expect(await send(mode, fixture)).toEqual({
        id: QUEUE_ID,
        status: 'cancelled',
      });
      expectNoDelivery(fixture);
    });

    it('refuses a queue group that differs from the post group', async () => {
      const scope = { wsId: WS_ID, groupId: 'other-group' };
      const fixture = createSbAdminMock({
        checkRows: [check()],
        queueRows: queueRows(scope),
        memberships: [],
      });
      expect(await send(mode, fixture, scope)).toEqual({
        id: QUEUE_ID,
        status: 'cancelled',
      });
      expectNoDelivery(fixture);
    });

    it('refuses a queue workspace that differs from the post workspace', async () => {
      const scope = { wsId: 'other-workspace', groupId: GROUP_ID };
      const fixture = createSbAdminMock({
        checkRows: [check()],
        queueRows: queueRows(scope),
        memberships: [],
      });
      expect(await send(mode, fixture, scope)).toEqual({
        id: QUEUE_ID,
        status: 'cancelled',
      });
      expectNoDelivery(fixture);
    });

    it('recovers provider-accepted history after group transfer without resending', async () => {
      const fixture = createSbAdminMock({
        checkRows: [check()],
        queueRows: queueRows(),
        memberships: [
          {
            group_id: 'other-group',
            user_id: USER_ID,
            ws_id: WS_ID,
          },
        ],
        emailAuditRows: [
          {
            created_at: '2026-03-28T00:10:00.000Z',
            entity_id: POST_ID,
            entity_type: 'post',
            html_content: '<html>accepted delivery</html>',
            id: 'audit-history',
            sent_at: '2026-03-28T00:11:00.000Z',
            source_email: 'notifications@tuturuuu.com',
            source_name: 'Tuturuuu',
            status: 'sent',
            subject: 'Previously accepted post email',
            to_addresses: ['recipient@example.test'],
            user_id: SENDER_PLATFORM_USER_ID,
          },
        ],
      });
      expect(await send(mode, fixture)).toEqual({
        id: QUEUE_ID,
        status: 'sent',
      });
      expect(mocks.send).not.toHaveBeenCalled();
      expect(fixture.sentEmailInsertMock).toHaveBeenCalledTimes(1);
      expect(fixture.state.checkEmailUpdates).toEqual([
        {
          email_id: 'sent-1',
          post_id: POST_ID,
          user_id: USER_ID,
        },
      ]);
      expect(fixture.state.queueRows[0]).toMatchObject({
        status: 'sent',
        sent_email_id: 'sent-1',
      });
      expect(fixture.state.membershipReads).toEqual([]);
    });
  });
}

it('keeps an already queued check deliverable when its recipient moves groups', async () => {
  const memberships = [
    {
      group_id: GROUP_ID,
      user_id: USER_ID,
      ws_id: WS_ID,
    },
  ];
  const fixture = createSbAdminMock({
    checkRows: [check()],
    queueRows: [createQueueRow({ id: QUEUE_ID, user_id: USER_ID })],
    memberships,
    onQueueUpdate: ({ patch }) => {
      if (patch.status === 'processing') {
        memberships.splice(0, memberships.length, {
          group_id: 'other-group',
          user_id: USER_ID,
          ws_id: WS_ID,
        });
      }
    },
  });
  expect(await send('queued', fixture)).toEqual({
    id: QUEUE_ID,
    status: 'sent',
  });
  expect(memberships[0]?.group_id).toBe('other-group');
  expect(mocks.send).toHaveBeenCalledTimes(1);
  expect(fixture.state.membershipReads).toEqual([]);
});
