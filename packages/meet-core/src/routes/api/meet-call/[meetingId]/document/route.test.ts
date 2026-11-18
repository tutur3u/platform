import { beforeEach, expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => ({
  authority: vi.fn(),
  choice: vi.fn(),
  privateRequest: vi.fn(),
  context: vi.fn(),
  room: vi.fn(),
  join: vi.fn(),
  read: vi.fn(),
  run: vi.fn(),
  show: vi.fn(),
  hide: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('next/server', () => ({ connection: async () => undefined }));
vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: fixture.context,
}));
vi.mock('@tuturuuu/meet-core/features/call/lib/call-access', () => ({
  MeetCallAccessError: class extends Error {
    constructor(
      public status: number,
      message: string,
      public code?: string
    ) {
      super(message);
    }
  },
}));
vi.mock('@tuturuuu/meet-core/features/call/server/room-service', () => ({
  callRoomService: fixture.room,
  roomRoute: async (
    _request: Request,
    meetingId: string,
    work: (access: unknown) => Promise<unknown>
  ) => {
    try {
      return Response.json(
        await work({
          user: { id: 'actor' },
          meeting: { id: meetingId, ws_id: 'workspace' },
          canReadWorkspace: true,
        })
      );
    } catch (error) {
      const problem = error as { status?: number; code?: string };
      return Response.json(
        { code: problem.code },
        { status: problem.status ?? 500 }
      );
    }
  },
}));
vi.mock(
  '@tuturuuu/meet-core/features/call/server/documents',
  async (importOriginal) => {
    const { z } = await import('zod');
    const actual = await importOriginal<Record<string, unknown>>().catch(
      () => ({})
    );
    return {
      ...actual,
      meetingDocumentCommandSchema:
        actual.meetingDocumentCommandSchema ?? z.object({ action: z.string() }),
      joinMeetingDocument: fixture.join,
      readMeetingDocuments: fixture.read,
      runMeetingDocumentCommand: fixture.run,
      readDocumentTabParam: (request: Request) =>
        new URL(request.url).searchParams.get('tab') ?? 'primary',
    };
  }
);
vi.mock('@tuturuuu/utils/account-benefits-server', () => ({
  accountPrivateRpc: vi.fn(),
}));
vi.mock('../../../../../features/live-assistant/server/demo-authority', () => ({
  readMiraDemoAuthority: fixture.authority,
}));
vi.mock(
  '../../../../../features/live-assistant/server/private-consent',
  () => ({ requirePrivateMiraChoice: fixture.choice })
);
vi.mock('../../../../../features/call/server/personal-chat-request', () => ({
  requestPersonalMeetChat: fixture.privateRequest,
}));
vi.mock('../../../../../features/call/server/document-mira', () => ({
  showMiraInDocument: fixture.show,
  hideMiraInDocument: fixture.hide,
}));

import { MeetCallAccessError } from '@tuturuuu/meet-core/features/call/lib/call-access';
import { GET, POST } from './route';

const meetingId = '5e5217de-9bb3-4e20-8d99-526ad3e7e34f';
const tabId = '7f0c2e5a-4b1d-4c6e-8a9f-0d1e2f3a4b5c';
const params = { params: Promise.resolve({ meetingId }) };
const tabs = {
  tabs: [
    { id: 'primary', kind: 'doc', createdAt: 0, updatedAt: 0 },
    {
      id: tabId,
      kind: 'rubric',
      title: 'Lab Rubric',
      createdAt: 1,
      updatedAt: 1,
    },
  ],
  mira: null,
  edits: [],
};

beforeEach(() => {
  vi.resetAllMocks();
  fixture.context.mockResolvedValue({
    env: { MEET_AI_DISABLED: 'false', GOOGLE_GENERATIVE_AI_API_KEY: 'test' },
  });
  fixture.authority.mockResolvedValue({ allowed: true });
  fixture.choice.mockResolvedValue({ revision: 1 });
  fixture.read.mockResolvedValue(tabs);
  fixture.run.mockResolvedValue(tabs);
  fixture.join.mockResolvedValue({ documentId: 'document' });
  fixture.room.mockResolvedValue({});
  fixture.show.mockResolvedValue(undefined);
  fixture.hide.mockResolvedValue(undefined);
});

function post(body: unknown) {
  return POST(
    new Request(
      `https://meet.example.invalid/api/meet-call/${meetingId}/document`,
      {
        method: 'POST',
        body: JSON.stringify(body),
      }
    ),
    params
  );
}
const assist = (overrides: Record<string, unknown> = {}) =>
  post({
    action: 'assist',
    requestId: crypto.randomUUID(),
    startedAt: Date.now(),
    tabId,
    mode: 'refine',
    text: 'Partial credit at instructor discretion.',
    section: '§2 Grading Criteria',
    timezone: 'Asia/Ho_Chi_Minh',
    ...overrides,
  });

it('keeps the primary join and serves tab joins and tab lists', async () => {
  await GET(new Request('https://meet.example.invalid/document'), params);
  expect(fixture.join).toHaveBeenLastCalledWith(expect.anything(), 'primary');
  await GET(
    new Request(`https://meet.example.invalid/document?tab=${tabId}`),
    params
  );
  expect(fixture.join).toHaveBeenLastCalledWith(expect.anything(), tabId);
  const list = await GET(
    new Request('https://meet.example.invalid/document?view=tabs'),
    params
  );
  expect(await list.json()).toEqual(tabs);
});

it('forwards only browser tab commands and refuses Mira state injection', async () => {
  const created = await post({ action: 'create', kind: 'notes' });
  expect(created.status).toBe(200);
  expect(fixture.run).toHaveBeenCalledWith(expect.anything(), {
    action: 'create',
    kind: 'notes',
  });
  for (const body of [
    { action: 'documents.mira.presence', presence: null },
    {
      action: 'documents.mira.edit',
      edit: {
        id: tabId,
        tabId,
        source: 'live',
        action: 'draft',
        before: '',
        after: 'x',
      },
    },
    { action: 'create', kind: 'notes', id: tabId },
  ]) {
    expect((await post(body)).status).toBe(400);
  }
  expect(fixture.run).toHaveBeenCalledTimes(1);
  expect(fixture.room).not.toHaveBeenCalled();
});

it('runs a Mira assist through private consent, credits and attribution', async () => {
  fixture.privateRequest.mockImplementation(
    async (_access, payload, provider) => {
      expect(payload.question).toContain('<document-content>');
      expect(payload.history).toEqual([]);
      await provider.checkConsent();
      return {
        text: 'Partial credit: award 15/30 for an off-by-one base case.',
      };
    }
  );
  const response = await assist();
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body).toMatchObject({
    source: 'chat',
    text: 'Partial credit: award 15/30 for an off-by-one base case.',
  });
  expect(fixture.room).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({
      action: 'documents.mira.edit',
      consentRevision: 1,
      edit: expect.objectContaining({
        id: body.editId,
        tabId,
        source: 'chat',
        action: 'refine',
      }),
    })
  );
  expect(fixture.show).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({
      tabId,
      source: 'chat',
      status: 'editing',
      requestId: body.editId,
      consentRevision: 1,
    })
  );
  expect(fixture.choice).toHaveBeenCalledTimes(3);
});

it('requires Continue with Mira before any metered work', async () => {
  fixture.choice.mockRejectedValue(
    new MeetCallAccessError(403, 'Consent required', 'MIRA_CONSENT_REQUIRED')
  );
  const response = await assist();
  expect(response.status).toBe(403);
  expect(await response.json()).toEqual({ code: 'MIRA_CONSENT_REQUIRED' });
  expect(fixture.privateRequest).not.toHaveBeenCalled();
  expect(fixture.show).not.toHaveBeenCalled();
});

it('clears Mira presence when credits are unavailable', async () => {
  fixture.privateRequest.mockRejectedValue(
    new MeetCallAccessError(403, 'Credits', 'MIRA_CREDITS_UNAVAILABLE')
  );
  const response = await assist();
  expect(response.status).toBe(403);
  expect(await response.json()).toEqual({ code: 'MIRA_CREDITS_UNAVAILABLE' });
  expect(fixture.hide).toHaveBeenCalledWith(
    expect.anything(),
    tabId,
    expect.any(String)
  );
});

const roomWrites = () =>
  fixture.room.mock.calls.map(
    ([, command]) => (command as { action: string }).action
  );
const shownStatuses = () =>
  fixture.show.mock.calls.map(
    ([, input]) => (input as { status: string }).status
  );

it('denies a Continue choice changed during generation with no shared edit or reviewing state', async () => {
  const requestId = crypto.randomUUID();
  fixture.choice
    .mockResolvedValueOnce({ revision: 1 })
    .mockResolvedValueOnce({ revision: 1 })
    .mockResolvedValue({ revision: 2 });
  fixture.privateRequest.mockImplementation(
    async (_access, _payload, provider) => {
      await provider.checkConsent();
      return { text: 'Answer produced before the choice changed.' };
    }
  );
  const response = await assist({ requestId });
  expect(response.status).toBe(403);
  expect(await response.json()).toEqual({ code: 'MIRA_CONSENT_REQUIRED' });
  expect(roomWrites()).not.toContain('documents.mira.edit');
  expect(shownStatuses()).toEqual(['editing']);
  expect(fixture.hide).toHaveBeenCalledWith(
    expect.anything(),
    tabId,
    requestId
  );
});

it('denies a recovered receipt when the choice changed before the room write', async () => {
  fixture.choice
    .mockResolvedValueOnce({ revision: 1 })
    .mockResolvedValue({ revision: 3 });
  // A retried request returns its stored answer without generating again.
  fixture.privateRequest.mockResolvedValue({ text: 'Recovered answer.' });
  const response = await assist();
  expect(response.status).toBe(403);
  expect(roomWrites()).not.toContain('documents.mira.edit');
  expect(shownStatuses()).toEqual(['editing']);
});

it('maps a room revision-guard refusal to a consent failure and releases presence', async () => {
  const requestId = crypto.randomUUID();
  fixture.privateRequest.mockResolvedValue({ text: 'Answer.' });
  fixture.room.mockRejectedValue(
    new MeetCallAccessError(403, 'Room action is unavailable')
  );
  const response = await assist({ requestId });
  expect(response.status).toBe(403);
  expect(await response.json()).toEqual({ code: 'MIRA_CONSENT_REQUIRED' });
  expect(shownStatuses()).toEqual(['editing']);
  expect(fixture.hide).toHaveBeenCalledWith(
    expect.anything(),
    tabId,
    requestId
  );
});

it('cancels a streamed body past 64 KiB before parsing or forwarding it', async () => {
  let pulled = 0;
  let cancelled = false;
  const chunk = new TextEncoder().encode(' '.repeat(16 * 1024));
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      pulled += 1;
      if (pulled > 64) controller.close();
      else controller.enqueue(chunk);
    },
    cancel() {
      cancelled = true;
    },
  });
  const response = await POST(
    new Request(
      `https://meet.example.invalid/api/meet-call/${meetingId}/document`,
      {
        method: 'POST',
        body,
        duplex: 'half',
      } as RequestInit
    ),
    params
  );
  expect(response.status).toBe(413);
  expect(cancelled).toBe(true);
  expect(pulled).toBeLessThanOrEqual(6);
  expect(fixture.run).not.toHaveBeenCalled();
});

it('rejects a known-length oversize body', async () => {
  const response = await post({
    action: 'create',
    kind: 'notes',
    title: 'x'.repeat(70 * 1024),
  });
  expect(response.status).toBe(413);
  expect(fixture.run).not.toHaveBeenCalled();
});

it('rejects unknown tabs, empty refine selections and disabled deployments', async () => {
  expect((await assist({ tabId: crypto.randomUUID() })).status).toBe(404);
  expect((await assist({ text: '   ' })).status).toBe(400);
  fixture.context.mockResolvedValue({ env: { MEET_AI_DISABLED: 'true' } });
  const disabled = await assist();
  expect(disabled.status).toBe(403);
  expect(await disabled.json()).toEqual({ code: 'MIRA_DEPLOYMENT_DISABLED' });
});
