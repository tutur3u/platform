import { InternalApiError } from '@tuturuuu/internal-api/client';
import { describe, expect, it, vi } from 'vitest';
import { FeedbackSubmission, type SubmissionState } from './submission';

const draft = {
  category: 'bug' as const,
  title: ' Synthetic bug ',
  details: '<script>plain text</script>',
};
const receipt = {
  id: '22222222-2222-4222-8222-222222222222',
  createdAt: '2026-11-13T00:00:00Z',
};
function setup() {
  const send = vi.fn().mockResolvedValue(receipt);
  const read = vi.fn().mockResolvedValue({ receipt: null });
  const key = vi.fn().mockReturnValue('11111111-1111-4111-8111-111111111111');
  const now = vi.fn().mockReturnValue(1000);
  const states: SubmissionState[] = [];
  const controller = new FeedbackSubmission({
    send,
    read,
    key,
    now,
    changed: (s) => states.push(s),
  });
  return { controller, send, read, key, now, states };
}
describe('authenticated feedback submission lifecycle', () => {
  it('hands text to existing intake without actor, approval, priority or webhook claims', async () => {
    const { controller, send, states } = setup();
    await controller.submit(draft, 'challenge');
    expect(send).toHaveBeenCalledWith({
      title: 'Synthetic bug',
      body: 'Category: bug\n\n<script>plain text</script>',
      idempotencyKey: '11111111-1111-4111-8111-111111111111',
      turnstileToken: 'challenge',
    });
    expect(states).toEqual([{ kind: 'sending' }, { kind: 'success', receipt }]);
    await controller.submit(draft, 'another');
    expect(send).toHaveBeenCalledTimes(1);
  });
  it('fences rapid duplicate submits while the first operation is pending', async () => {
    const { controller, send } = setup();
    let finish!: (value: unknown) => void;
    send.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      })
    );
    const first = controller.submit(draft, 'challenge');
    await controller.submit(draft, 'challenge');
    expect(send).toHaveBeenCalledTimes(1);
    finish(receipt);
    await first;
  });
  it.each([
    { ...draft, title: ' ' },
    { ...draft, details: ' ' },
    { ...draft, title: 'a'.repeat(161) },
    { ...draft, details: 'a'.repeat(8000) },
  ])('rejects invalid or oversized text before sending', async (invalid) => {
    const { controller, send } = setup();
    await controller.submit(invalid, 'challenge');
    expect(send).not.toHaveBeenCalled();
    expect(controller.state).toMatchObject({ kind: 'error', code: 'invalid' });
  });
  it('requires a challenge even for a signed-in caller', async () => {
    const { controller, send } = setup();
    await controller.submit(draft, '');
    expect(send).not.toHaveBeenCalled();
  });
  it.each([401, 403])(
    'stops submission and receipt access on actor denial %s',
    async (status) => {
      const { controller, send, read } = setup();
      send.mockRejectedValue(
        new InternalApiError('private provider details', status)
      );
      await controller.submit(draft, 'challenge');
      expect(controller.state).toEqual({
        kind: 'denied',
        code: status === 401 ? 'login' : 'forbidden',
      });
      await controller.submit(draft, 'another');
      await controller.check();
      expect(send).toHaveBeenCalledTimes(1);
      expect(read).not.toHaveBeenCalled();
    }
  );
  it('honors rate limits and reuses the exact idempotency key after a known rejection', async () => {
    const { controller, send, now, key } = setup();
    send.mockRejectedValueOnce(
      new InternalApiError('limited', 429, undefined, 10)
    );
    await controller.submit(draft, 'first');
    expect(controller.state).toEqual({
      kind: 'error',
      code: 'limited',
      retryAt: 11000,
    });
    await controller.submit(draft, 'early');
    expect(send).toHaveBeenCalledTimes(1);
    now.mockReturnValue(11000);
    await controller.submit(draft, 'fresh');
    expect(key).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[1]?.[0].idempotencyKey).toBe(
      send.mock.calls[0]?.[0].idempotencyKey
    );
    expect(controller.state.kind).toBe('success');
  });
  it.each([
    new Error('network lost'),
    new InternalApiError('unavailable', 503),
  ])(
    'never replays an unknown write before owner receipt reconciliation',
    async (error) => {
      const { controller, send, read } = setup();
      send.mockRejectedValue(error);
      await controller.submit(draft, 'challenge');
      expect(controller.state.kind).toBe('uncertain');
      await controller.submit({ ...draft, title: 'Other' }, 'another');
      expect(send).toHaveBeenCalledTimes(1);
      read.mockResolvedValue({ receipt });
      await controller.check();
      expect(read).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111');
      expect(controller.state).toEqual({ kind: 'success', receipt });
      expect(send).toHaveBeenCalledTimes(1);
    }
  );
  it('retries the frozen payload with the original key and a fresh challenge after a null receipt', async () => {
    const { controller, send } = setup();
    send.mockRejectedValueOnce(new Error('connection lost'));
    await controller.submit(draft, 'old');
    await controller.check();
    expect(controller.state.kind).toBe('retry');
    await controller.submit({ ...draft, title: 'Other' }, 'fresh');
    expect(send.mock.calls[1]?.[0]).toEqual({
      ...send.mock.calls[0]?.[0],
      turnstileToken: 'fresh',
    });
  });
  it('does not accept malformed success responses or failed receipt reads as success', async () => {
    const { controller, send, read } = setup();
    send.mockResolvedValue({ ok: true });
    await controller.submit(draft, 'challenge');
    expect(controller.state.kind).toBe('uncertain');
    read.mockResolvedValue({ receipt: { id: 'not-a-receipt' } });
    await controller.check();
    expect(controller.state.kind).toBe('uncertain');
    read.mockRejectedValue(new Error('transport lost'));
    await controller.check();
    expect(controller.state.kind).toBe('uncertain');
    expect(send).toHaveBeenCalledTimes(1);
  });
  it('does not disclose a receipt after session revocation', async () => {
    const { controller, send, read } = setup();
    send.mockRejectedValue(new Error('lost'));
    await controller.submit(draft, 'challenge');
    read.mockRejectedValue(new InternalApiError('denied', 401));
    await controller.check();
    expect(controller.state).toEqual({ kind: 'denied', code: 'login' });
  });
});
