import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), execute: vi.fn() }));
vi.mock('@tuturuuu/ai/studio/auth', () => ({
  authenticateAiStudioRequest: mocks.auth,
}));
vi.mock('@/lib/text-execution', () => ({
  parseTextRequest: (value: unknown) => value,
  executeTextRequest: mocks.execute,
}));
vi.mock('@/lib/public-api', () => ({
  publicApiError: (error: { status?: number }) =>
    Response.json({ error: 'rejected' }, { status: error.status ?? 500 }),
}));

import { POST } from './route';

const root = '00000000-0000-0000-0000-000000000000';
const sponsorship = {
  workshopId: 'room',
  workshopTitle: 'RISE Induction Day',
  hostId: 'host',
  teamId: 'team-1',
  teamName: 'Marketing',
  participantId: 'attendee',
  operation: 'analyze',
  phase: 'prompt_review',
  scenarioId: 'rise-induction-post',
  jobId: '07a13d30-0599-4572-8d1d-159860105e10',
  sequence: 1,
};
const request = (body: unknown) =>
  new Request('https://ai.tuturuuu.com/v1/colab/responses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
describe('Colab sponsorship boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({
      workspaceId: root,
      actorId: 'key-owner',
      apiKey: { external_app_id: null },
    });
    mocks.execute.mockResolvedValue(Response.json({ choices: [] }));
  });
  it('charges only root credits with complete workshop evidence and bounded execution', async () => {
    const response = await POST(
      request({
        sponsorship,
        instructions: 'Review the prompt',
        prompt: 'RISE draft',
        model: 'google/gemini-2.5-flash',
        tools: ['external'],
        max_steps: 100,
      })
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('x-colab-sponsor-workspace')).toBe(root);
    const [, input, options] = mocks.execute.mock.calls[0]!;
    expect(input).toMatchObject({
      max_steps: 1,
      max_output_tokens: 4096,
      tools: [],
      stream: false,
    });
    expect(options).toMatchObject({
      requirePricedUsage: true,
      credential: { kind: 'api-key', workspaceId: root },
      metadata: {
        ...sponsorship,
        sponsor_workspace_id: root,
        product: 'colab',
      },
    });
    expect(options.metadata.description).toContain('RISE Induction Day');
  });
  it.each([
    { workspaceId: 'another-workspace', external_app_id: null },
    { workspaceId: root, external_app_id: 'colab' },
  ])(
    'rejects non-root or unmetered app-bound credentials: %j',
    async (value) => {
      mocks.auth.mockResolvedValue({
        workspaceId: value.workspaceId,
        actorId: 'key-owner',
        apiKey: { external_app_id: value.external_app_id },
      });
      expect((await POST(request({ sponsorship }))).status).toBe(403);
      expect(mocks.execute).not.toHaveBeenCalled();
    }
  );
  it('rejects incomplete sponsorship evidence before generation', async () => {
    expect(
      (await POST(request({ sponsorship: { workshopId: 'room' } }))).status
    ).toBe(400);
    expect(mocks.execute).not.toHaveBeenCalled();
  });
  it('does not claim sponsorship when metering fails', async () => {
    mocks.execute.mockResolvedValue(
      Response.json({ error: 'insufficient_credits' }, { status: 402 })
    );
    const response = await POST(
      request({
        sponsorship,
        prompt: 'draft',
        model: 'google/gemini-2.5-flash',
      })
    );
    expect(response.status).toBe(402);
    expect(response.headers.has('x-colab-sponsor-workspace')).toBe(false);
  });
});
