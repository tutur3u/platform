import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  room: vi.fn(),
  workspace: vi.fn(),
  credits: vi.fn(),
  model: vi.fn(),
  answer: vi.fn(),
  cap: vi.fn(),
  consent: vi.fn(),
  authority: vi.fn(),
  context: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: mocks.context,
}));
vi.mock('@tuturuuu/ai/credits/cap-output-tokens', () => ({
  capMaxOutputTokensByCredits: mocks.cap,
}));
vi.mock('@tuturuuu/ai/credits/check-credits', () => ({
  checkAiCredits: mocks.credits,
}));
vi.mock('@tuturuuu/ai/meetings/chat', () => ({ answerMeetChat: mocks.answer }));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(),
}));
vi.mock('../../live-assistant/server/demo-authority', () => ({
  readMiraDemoAuthority: mocks.authority,
}));
vi.mock('../../live-assistant/server/private-consent', () => ({
  requirePrivateMiraChoice: mocks.consent,
}));
vi.mock('../lib/call-access', () => ({ MeetCallAccessError: Error }));
vi.mock('./chat-billing', () => ({
  billMeetChat: (_input: unknown, generate: () => Promise<unknown>) =>
    generate(),
}));
vi.mock('./chat-model', () => ({ getMeetChatModel: mocks.model }));
vi.mock('./room-service', () => ({
  callRoomService: mocks.room,
  personalWorkspace: mocks.workspace,
}));

import { pollActionSchema, runPollAction } from './polls';

const id = '9987d372-ee63-4228-8b17-3757ca5d1ccf';
const access = {
  user: { id: 'manager' },
  meeting: { id, ws_id: 'shared-workspace' },
  canReadWorkspace: true,
} as Parameters<typeof runPollAction>[0];
const draftAction = pollActionSchema.parse({
  action: 'mira_draft',
  prompt: 'What should we do next?',
  anonymous: true,
  locale: 'vi',
});
const summaryAction = pollActionSchema.parse({
  action: 'mira_summarize',
  pollId: id,
});

beforeEach(() => {
  vi.resetAllMocks();
  mocks.context.mockResolvedValue({
    env: {
      MEET_AI_DISABLED: 'false',
      GOOGLE_GENERATIVE_AI_API_KEY: 'test-key',
    },
  });
  mocks.consent.mockResolvedValue({ revision: 2 });
  mocks.authority.mockResolvedValue({ allowed: true });
  mocks.workspace.mockResolvedValue('personal-workspace');
  mocks.model.mockResolvedValue({ id: 'demo-model' });
  mocks.credits.mockResolvedValue({
    allowed: true,
    remainingCredits: 30,
    maxOutputTokens: 500,
  });
  mocks.cap.mockResolvedValue(500);
});

it('drafts through the caller’s credits and validates the model’s JSON before creating the draft', async () => {
  const definition = {
    type: 'single_choice',
    question: 'Which next?',
    options: ['A', 'B'],
  };
  mocks.answer.mockResolvedValue({
    text: ['```json', JSON.stringify(definition), '```'].join('\n'),
  });
  mocks.room
    .mockResolvedValueOnce({ ok: true })
    .mockResolvedValueOnce({ pollId: id });
  await expect(runPollAction(access, draftAction)).resolves.toEqual({
    pollId: id,
    fallback: false,
  });
  expect(mocks.room.mock.calls[0]?.[1]).toEqual({ action: 'poll.authorize' });
  expect(mocks.workspace).toHaveBeenCalledWith('manager');
  expect(mocks.credits).toHaveBeenCalledWith(
    'personal-workspace',
    'demo-model',
    'chat',
    expect.objectContaining({ userId: 'manager' })
  );
  expect(mocks.answer.mock.calls[0]?.[2]).toContain('Vietnamese');
  expect(mocks.room.mock.calls[1]?.[1]).toEqual({
    action: 'poll.create',
    definition,
    anonymous: true,
  });
});

it('requires the durable manager check before calling credit or generation services', async () => {
  mocks.room.mockRejectedValue(new Error('Forbidden'));
  await expect(runPollAction(access, draftAction)).rejects.toThrow('Forbidden');
  await expect(runPollAction(access, summaryAction)).rejects.toThrow(
    'Forbidden'
  );
  expect(mocks.credits).not.toHaveBeenCalled();
  expect(mocks.answer).not.toHaveBeenCalled();
});

it.each(['quota', 'disabled', 'malformed', 'consent changed'])(
  'falls back to a safe draft when %s',
  async (reason) => {
    if (reason === 'quota') mocks.credits.mockResolvedValue({ allowed: false });
    if (reason === 'disabled') mocks.context.mockResolvedValue({ env: {} });
    if (reason === 'malformed')
      mocks.answer.mockResolvedValue({
        text: '{"type":"open_text","question":"Q","correctOptionIds":[]}',
      });
    if (reason === 'consent changed')
      mocks.consent
        .mockResolvedValueOnce({ revision: 2 })
        .mockResolvedValueOnce({ revision: 3 });
    mocks.room
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ pollId: id });
    await expect(runPollAction(access, draftAction)).resolves.toEqual({
      pollId: id,
      fallback: true,
    });
    expect(mocks.room.mock.calls[1]?.[1]).toMatchObject({
      definition: { type: 'open_text', question: 'What should we do next?' },
    });
    if (reason !== 'malformed') expect(mocks.answer).not.toHaveBeenCalled();
  }
);

it('summarizes the projected aggregate without including identifying fields or unsupported model output', async () => {
  mocks.room.mockResolvedValue({
    question: 'How was it?',
    results: {
      responseCount: 1,
      tally: [],
      answers: ['Helpful'],
      responses: [{ userId: 'identity to redact' }],
    },
  });
  mocks.answer.mockResolvedValue({
    text: '{"summary":"One response said it was helpful."}',
  });
  await expect(runPollAction(access, summaryAction)).resolves.toEqual({
    summary: 'One response said it was helpful.',
    fallback: false,
    responseCount: 1,
  });
  const prompt = mocks.answer.mock.calls[0]?.[2];
  expect(prompt).toContain('Helpful');
  expect(prompt).not.toContain('identity to redact');
  mocks.answer.mockResolvedValue({ text: 'unstructured' });
  await expect(runPollAction(access, summaryAction)).resolves.toEqual({
    summary: null,
    fallback: true,
    responseCount: 1,
  });
});
