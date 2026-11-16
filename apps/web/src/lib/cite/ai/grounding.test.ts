import { CiteWorkSchema } from '@tuturuuu/cite';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createCitationAiGrounding } from './grounding';

const mocked = vi.hoisted(() => ({
  reserve: vi.fn(),
  create: vi.fn(),
  capture: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('../capture', () => ({
  createCitationGroundingSession: mocked.create,
}));
vi.mock('../lookup-budget', () => ({ reserveCitationLookup: mocked.reserve }));
const work = CiteWorkSchema.parse({
  id: 'synthetic',
  type: 'book',
  title: 'Invented rivers',
});

beforeEach(() => {
  vi.clearAllMocks();
  mocked.reserve.mockResolvedValue({ kind: 'allowed' });
  mocked.create.mockReturnValue({
    capture: mocked.capture,
    receipt: () => ({ operations: 0, elapsedMs: 0 }),
  });
  mocked.capture.mockResolvedValue({ kind: 'captured', work });
});

describe('AI source budget adapter', () => {
  it('starts after generation and reuses one admitted source session across identifiers', async () => {
    const headers = new Headers({ 'cf-connecting-ip': '203.0.113.7' });
    const ground = createCitationAiGrounding(headers);
    expect(mocked.create).not.toHaveBeenCalled();
    expect(mocked.reserve).not.toHaveBeenCalled();
    const signal = new AbortController().signal;
    expect(await ground('10.1234/synthetic', signal)).toEqual(work);
    expect(await ground('ISBN:9780306406157', signal)).toEqual(work);
    expect(mocked.reserve).toHaveBeenCalledExactlyOnceWith(headers);
    expect(mocked.create).toHaveBeenCalledExactlyOnceWith({ signal });
    expect(mocked.capture).toHaveBeenCalledTimes(2);
  });

  it('performs no source read when the shared lookup budget is refused', async () => {
    mocked.reserve.mockResolvedValue({
      kind: 'rejected',
      status: 429,
      retryAfter: 60,
    });
    const ground = createCitationAiGrounding(new Headers());
    const signal = new AbortController().signal;
    expect(await ground('10.1234/synthetic', signal)).toBeNull();
    expect(await ground('ISBN:9780306406157', signal)).toBeNull();
    expect(mocked.reserve).toHaveBeenCalledTimes(1);
    expect(mocked.create).not.toHaveBeenCalled();
    expect(mocked.capture).not.toHaveBeenCalled();
  });

  it('does not reserve or fetch after cancellation', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      createCitationAiGrounding(new Headers())(
        '10.1234/synthetic',
        controller.signal
      )
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(mocked.reserve).not.toHaveBeenCalled();
    expect(mocked.capture).not.toHaveBeenCalled();
  });

  it('does not auto-select candidates or fabricate a work from an incomplete draft', async () => {
    mocked.capture
      .mockResolvedValueOnce({ kind: 'candidates', candidates: [work] })
      .mockResolvedValueOnce({ kind: 'manual', fields: { title: '' } });
    const ground = createCitationAiGrounding(new Headers());
    const signal = new AbortController().signal;
    expect(await ground('10.1234/synthetic', signal)).toBeNull();
    expect(await ground('ISBN:9780306406157', signal)).toBeNull();
  });
});
