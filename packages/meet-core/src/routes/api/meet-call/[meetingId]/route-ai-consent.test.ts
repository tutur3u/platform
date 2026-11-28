import { beforeEach, expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => ({
  lookup: vi.fn(),
  assist: vi.fn(),
  poll: vi.fn(),
  quiz: vi.fn(),
  formAction: vi.fn(),
  summary: vi.fn(),
  activity: vi.fn(),
  programming: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('next/server', () => ({ connection: async () => undefined }));
vi.mock('@tuturuuu/utils/ai-data-consent-store', () => ({
  AI_DATA_CONSENT_POLICY_VERSION: '2026-11-28',
  lookupAiDataConsent: fixture.lookup,
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
vi.mock('@tuturuuu/meet-core/features/call/server/room-service', () => {
  const run = async (
    _request: Request,
    meetingId: string,
    ...rest: unknown[]
  ) => {
    const work = rest.at(-1) as (access: unknown) => Promise<unknown>;
    try {
      return Response.json(
        await work({
          guest: false,
          user: { id: 'actor' },
          isHost: true,
          canReadWorkspace: true,
          meeting: { id: meetingId, ws_id: 'workspace' },
        })
      );
    } catch (error) {
      const problem = error as { status?: number; code?: string };
      return Response.json(
        { code: problem.code },
        { status: problem.status ?? 500 }
      );
    }
  };
  return {
    callRoomService: vi.fn(),
    roomRoute: run,
    guestPollRoomRoute: run,
    meetCallRoomRoute: run,
  };
});
vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: async () => ({
    env: { MEET_AI_DISABLED: 'false', GOOGLE_GENERATIVE_AI_API_KEY: 'key' },
  }),
}));
vi.mock('@tuturuuu/meet-core/features/call/server/documents', () => ({
  joinMeetingDocument: vi.fn(),
  meetingDocumentCommandSchema: { safeParse: () => ({ success: false }) },
  readDocumentTabParam: vi.fn(),
  readMeetingDocumentsForViewer: vi.fn(),
  runMeetingDocumentCommand: vi.fn(),
}));
vi.mock('../../../../features/call/server/document-body', () => ({
  readDocumentBody: (request: Request) => request.json(),
}));
vi.mock('../../../../features/call/server/document-assist', () => ({
  meetingDocumentAssistSchema: {
    safeParse: (data: unknown) => ({ success: true, data }),
  },
  assistMeetingDocument: fixture.assist,
}));
vi.mock('../../../../features/live-assistant/server/private-consent', () => ({
  requirePrivateMiraChoice: async () => ({ revision: 1 }),
}));
vi.mock('../../../../features/live-assistant/server/demo-authority', () => ({
  readMiraDemoAuthority: async () => ({ allowed: true, payer: 'account' }),
}));
vi.mock('../../../../features/call/server/polls', () => ({
  pollActionSchema: { parse: (value: unknown) => value },
  runPollAction: fixture.poll,
}));
vi.mock('../../../../features/call/server/quiz-arena', () => ({
  quizArenaActionSchema: { parse: (value: unknown) => value },
  runQuizArenaAction: fixture.quiz,
}));
vi.mock('../../../../features/call/server/forms/definition', () => ({
  MAX_FORM_BODY_BYTES: 48 * 1024,
}));
vi.mock('../../../../features/call/server/forms/launches', () => ({
  launchActionSchema: { parse: (value: unknown) => value },
  listFormLaunches: vi.fn(),
  runFormLaunchAction: fixture.formAction,
}));
vi.mock('../../../../features/call/server/forms/request', () => ({
  readFormBody: (request: Request) => request.json(),
}));
vi.mock('../../../../features/call/server/forms/route-guard', async () => ({
  meetFormsRoute: (
    await import('@tuturuuu/meet-core/features/call/server/room-service')
  ).roomRoute,
}));
vi.mock('../../../../features/call/server/forms-results/mira-summary', () => ({
  summarizeFormsResults: fixture.summary,
}));
vi.mock('../../../../features/call/server/forms-results/read-launch', () => ({
  loadLaunchResults: vi.fn(),
}));
vi.mock('../../../../features/call/server/forms-results/results', () => ({
  exportFormsResults: vi.fn(),
  FormsResultsAccessError: class extends Error {},
  readFormsResults: async () => ({ responseCount: 1, questions: [] }),
}));
vi.mock(
  '../../../../features/call/server/live-activities/mira-activity-draft',
  () => ({ draftMeetLiveActivity: fixture.activity })
);
vi.mock('@tuturuuu/meet-core/features/call/server/programming', () => ({
  checkMeetingProgramming: vi.fn(),
  createMeetingPlayground: vi.fn(),
  executeMeetingPlayground: vi.fn(),
  joinMeetingProgramming: vi.fn(),
  readMeetingPlaygroundRun: vi.fn(),
  readMeetingProgrammingTest: vi.fn(),
  setMeetingProgramming: vi.fn(),
  testMeetingProgramming: vi.fn(),
}));
vi.mock('../../../../features/call/server/personal-chat-body', () => ({
  readPersonalChatBody: (request: Request) => request.json(),
}));
vi.mock('../../../../features/call/server/programming-mira', () => ({
  changeMeetingProgrammingMira: fixture.programming,
  readMeetingProgrammingMira: vi.fn(),
}));

import { POST as documentPost } from './document/route';
import { POST as formsPost } from './forms/route';
import { POST as resultsPost } from './forms/results/route';
import { POST as activityPost } from './live-activities/mira-draft/route';
import { POST as pollsPost } from './polls/route';
import { POST as programmingPost } from './programming/route';
import { POST as quizPost } from './quiz-arena/route';

type Handler = (
  request: Request,
  context: { params: Promise<{ meetingId: string }> }
) => Promise<Response>;
type Case = {
  handler: Handler;
  body?: unknown;
  query?: string;
  headers?: Record<string, string>;
  downstream: ReturnType<typeof vi.fn>;
};

const uuid = '00000000-0000-4000-8000-000000000001';
const send = (item: Case, native: boolean) =>
  item.handler(
    new Request(`https://meet.example.test/api${item.query ?? ''}`, {
      method: 'POST',
      headers: {
        ...item.headers,
        ...(native ? { Authorization: 'Bearer native.supabase.jwt' } : {}),
      },
      body: item.body === undefined ? undefined : JSON.stringify(item.body),
    }),
    { params: Promise.resolve({ meetingId: 'meeting' }) }
  );

const gated: Record<string, Case> = {
  'document assist': {
    handler: documentPost,
    body: { action: 'assist', prompt: 'Tidy this' },
    downstream: fixture.assist,
  },
  'poll draft': {
    handler: pollsPost,
    body: { action: 'mira_draft', prompt: 'Lunch', anonymous: false },
    downstream: fixture.poll,
  },
  'poll summary': {
    handler: pollsPost,
    body: { action: 'mira_summarize', pollId: uuid },
    downstream: fixture.poll,
  },
  'quiz board': {
    handler: quizPost,
    body: { action: 'mira_generate_board', useStarterFallback: false },
    downstream: fixture.quiz,
  },
  'form draft': {
    handler: formsPost,
    body: { action: 'mira_draft', prompt: 'Feedback form' },
    downstream: fixture.formAction,
  },
  'form results summary': {
    handler: resultsPost,
    query: `?launchId=${uuid}`,
    headers: { 'Idempotency-Key': uuid },
    downstream: fixture.summary,
  },
  'live activity draft': {
    handler: activityPost,
    body: { prompt: 'Warm-up' },
    downstream: fixture.activity,
  },
  'programming analyze': {
    handler: programmingPost,
    query: '?mira',
    body: { action: 'analyze' },
    downstream: fixture.programming,
  },
};

const ungated: Record<string, Case> = {
  'poll vote': {
    handler: pollsPost,
    body: { action: 'vote', pollId: uuid },
    downstream: fixture.poll,
  },
  'starter quiz board': {
    handler: quizPost,
    body: { action: 'mira_generate_board', useStarterFallback: true },
    downstream: fixture.quiz,
  },
  'form launch': {
    handler: formsPost,
    body: { action: 'launch', formId: uuid },
    downstream: fixture.formAction,
  },
  'programming publish': {
    handler: programmingPost,
    query: '?mira',
    body: { action: 'publish', id: uuid },
    downstream: fixture.programming,
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  fixture.lookup.mockResolvedValue(false);
  for (const mock of [
    fixture.assist,
    fixture.poll,
    fixture.quiz,
    fixture.formAction,
    fixture.summary,
    fixture.activity,
    fixture.programming,
  ])
    mock.mockResolvedValue({ ok: true });
});

it.each(Object.entries(gated))(
  'refuses a native %s without Mira AI data consent',
  async (_name, item) => {
    const response = await send(item, true);
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ code: 'ai_consent_required' });
    expect(fixture.lookup).toHaveBeenCalledWith('actor', undefined);
    expect(item.downstream).not.toHaveBeenCalled();
  }
);

it.each(Object.entries(gated))(
  'runs a %s for a consented native caller',
  async (_name, item) => {
    fixture.lookup.mockResolvedValue(true);
    expect((await send(item, true)).status).toBe(200);
    expect(item.downstream).toHaveBeenCalledTimes(1);
  }
);

it.each(Object.entries(gated))(
  'never looks up consent for a browser %s',
  async (_name, item) => {
    expect((await send(item, false)).status).toBe(200);
    expect(item.downstream).toHaveBeenCalledTimes(1);
    expect(fixture.lookup).not.toHaveBeenCalled();
  }
);

it.each(Object.entries(ungated))(
  'leaves a native %s without AI ungated',
  async (_name, item) => {
    expect((await send(item, true)).status).toBe(200);
    expect(item.downstream).toHaveBeenCalledTimes(1);
    expect(fixture.lookup).not.toHaveBeenCalled();
  }
);
