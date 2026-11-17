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
vi.mock('./grounding-budget', () => ({
  reserveCitationGrounding: mocked.reserve,
}));
const actorId = '00000000-0000-4000-8000-00000000a401';
const work = CiteWorkSchema.parse({
  id: 'synthetic',
  type: 'book',
  title: 'Invented rivers',
});

beforeEach(() => {
  vi.clearAllMocks();
  mocked.reserve.mockResolvedValue(true);
  mocked.create.mockReturnValue({
    capture: mocked.capture,
    receipt: () => ({ operations: 0, elapsedMs: 0 }),
  });
  mocked.capture.mockResolvedValue({ kind: 'captured', work });
});

describe('AI source session adapter', () => {
  it('grounds an authenticated actor without Cloudflare headers and reuses the source session', async () => {
    const { ground, reserveGrounding } = createCitationAiGrounding(actorId);
    expect(await reserveGrounding()).toBe(true);
    expect(mocked.reserve).toHaveBeenCalledExactlyOnceWith(actorId);
    expect(mocked.create).not.toHaveBeenCalled();
    const signal = new AbortController().signal;
    expect(await ground('10.1234/synthetic', signal)).toEqual(work);
    expect(await ground('ISBN:9780306406157', signal)).toEqual(work);
    expect(mocked.reserve).toHaveBeenCalledTimes(1);
    expect(mocked.create).toHaveBeenCalledExactlyOnceWith({ signal });
    expect(mocked.capture).toHaveBeenCalledTimes(2);
  });

  it('does not reserve or fetch after cancellation', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      createCitationAiGrounding(actorId).ground(
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
    const { ground } = createCitationAiGrounding(actorId);
    const signal = new AbortController().signal;
    expect(await ground('10.1234/synthetic', signal)).toBeNull();
    expect(await ground('ISBN:9780306406157', signal)).toBeNull();
  });
});
