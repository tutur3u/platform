import { expect, it, vi } from 'vitest';
import { InternalApiError } from './internal-api-error';
import {
  getMiraSoul,
  updateMiraSoul,
  validateMiraSoulReceipt,
} from './mira-soul';

it.each([
  null,
  {},
  { soul: null },
  { soul: [] },
  { soul: { name: 7 } },
  { soul: { name: 'N'.repeat(51) } },
  { soul: { name: 'Name', user_id: 'other-owner' } },
  { soul: { name: 'Name', tone: 7 } },
])('rejects malformed or foreign receipts %j', (payload) => {
  expect(() => validateMiraSoulReceipt(payload, 'actor-a')).toThrow(
    'Invalid assistant settings receipt'
  );
});
it('preserves valid existing fields and the deliberate no-row Mira receipt', () => {
  expect(
    validateMiraSoulReceipt({ soul: { name: 'Mira' } }, 'actor-a')
  ).toEqual({ soul: { name: 'Mira' } });
  const soul = {
    name: 'Custom',
    user_id: 'actor-a',
    tone: null,
    personality: 'Helpful',
  };
  expect(validateMiraSoulReceipt({ soul }, 'actor-a')).toEqual({ soul });
});
it('forwards cancellation to credentialed no-store GET and PATCH requests', async () => {
  const controller = new AbortController();
  const fetch = vi.fn<typeof globalThis.fetch>(
    async () =>
      new Response(
        JSON.stringify({ soul: { name: 'Custom', user_id: 'actor-a' } }),
        { status: 200 }
      )
  );
  await getMiraSoul('actor-a', {
    fetch,
    signal: controller.signal,
    baseUrl: 'https://example.invalid',
  });
  await updateMiraSoul(
    'actor-a',
    { name: 'Custom' },
    { fetch, signal: controller.signal, baseUrl: 'https://example.invalid' }
  );
  expect(fetch.mock.calls).toHaveLength(2);
  expect(fetch.mock.calls[0]).toEqual([
    'https://example.invalid/api/v1/mira/soul',
    expect.objectContaining({
      signal: controller.signal,
      cache: 'no-store',
      credentials: 'same-origin',
    }),
  ]);
  expect(fetch.mock.calls[1]).toEqual([
    'https://example.invalid/api/v1/mira/soul',
    expect.objectContaining({
      signal: controller.signal,
      method: 'PATCH',
      body: JSON.stringify({ name: 'Custom' }),
    }),
  ]);
});
it('retains actual HTTP permission and transport failures', async () => {
  await expect(
    getMiraSoul('actor-a', {
      fetch: vi.fn(async () => new Response('{}', { status: 403 })),
    })
  ).rejects.toBeInstanceOf(InternalApiError);
  const failure = new Error('Synthetic transport failure');
  await expect(
    updateMiraSoul(
      'actor-a',
      { name: 'Custom' },
      {
        fetch: vi.fn(async () => {
          throw failure;
        }),
      }
    )
  ).rejects.toBe(failure);
});
