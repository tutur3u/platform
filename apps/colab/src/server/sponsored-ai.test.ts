import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Env } from './env';
import { type SponsorshipContext, sponsoredGeneration } from './sponsored-ai';

const context = (): SponsorshipContext => ({
  workshopId: 'room',
  workshopTitle: 'RISE',
  hostId: 'host',
  teamId: 'team-1',
  teamName: 'Marketing',
  participantId: 'guest:member',
  operation: 'compile',
  scenarioId: 'rise-induction-post',
  jobId: '07a13d30-0599-4572-8d1d-159860105e10',
  sequence: 0,
  receipts: [],
});
afterEach(() => vi.unstubAllGlobals());
describe('sponsored model transport', () => {
  it('records confirmed root credit receipts and sends full attribution', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      Response.json(
        {
          id: 'request-1',
          choices: [{ message: { content: '{"skills":[]}' } }],
          tuturuuu: { run_id: 'ledger-run', billing: { billedCredits: 2.5 } },
        },
        {
          headers: {
            'x-colab-sponsor-workspace': '00000000-0000-0000-0000-000000000000',
          },
        }
      )
    );
    vi.stubGlobal('fetch', fetcher);
    const sponsorship = context();
    const env = { COLAB_AI_API_KEY: 'test-only-key', sponsorship } as Env;
    expect(
      await sponsoredGeneration(
        env,
        'Instructions',
        { prompt: 'Draft' },
        'generation'
      )
    ).toBe('{"skills":[]}');
    expect(sponsorship.receipts).toEqual([
      { requestId: 'request-1', runId: 'ledger-run', credits: 2.5 },
    ]);
    const [url, options] = fetcher.mock.calls[0]!;
    expect(url).toBe('https://ai.tuturuuu.com/v1/colab/responses');
    expect(JSON.parse(options.body).sponsorship).toMatchObject({
      workshopId: 'room',
      participantId: 'guest:member',
      phase: 'generation',
      sequence: 1,
    });
    expect(options.headers['Idempotency-Key']).toBe(`${sponsorship.jobId}:1`);
  });
  it('stops when sponsor credits are unavailable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(null, { status: 402 }))
    );
    await expect(
      sponsoredGeneration(
        { COLAB_AI_API_KEY: 'test-only-key', sponsorship: context() } as Env,
        'Instructions',
        {},
        'generation'
      )
    ).rejects.toThrow('sponsorship_exhausted');
  });
  it('rejects missing credit receipt proof', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ choices: [] }))
    );
    await expect(
      sponsoredGeneration(
        { COLAB_AI_API_KEY: 'test-only-key', sponsorship: context() } as Env,
        'Instructions',
        {},
        'generation'
      )
    ).rejects.toThrow('sponsorship_unavailable');
  });
});
