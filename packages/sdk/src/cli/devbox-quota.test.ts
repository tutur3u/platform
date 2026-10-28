import { InternalApiError } from '@tuturuuu/internal-api/client';
import { afterEach, expect, it, vi } from 'vitest';
import { agentRequest, withAgentRetries } from './devbox-agent-network';
import { printDevboxQuotaError } from './devbox-quota';

afterEach(() => {
  vi.restoreAllMocks();
  process.exitCode = 0;
});
it('prints the unchanged quota body and exits without a retry', () => {
  const write = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
  const payload = {
    code: 'DEVBOX_LIMIT_REACHED',
    limit: 'concurrent_runs',
    used: 2,
    max: 2,
    resetsAt: 'tomorrow',
    messages: { en: 'Limit reached', vi: 'Đã đạt giới hạn' },
  };
  expect(
    printDevboxQuotaError(
      new InternalApiError('limit', 429, payload.code, payload),
      true
    )
  ).toBe(true);
  expect(write).toHaveBeenCalledWith(`${JSON.stringify(payload)}\n`);
  expect(process.exitCode).toBe(75);
});
it('does not retry agent quota responses', async () => {
  const request = vi
    .fn()
    .mockResolvedValue(
      Response.json({ code: 'DEVBOX_LIMIT_REACHED' }, { status: 429 })
    );
  const response = await withAgentRetries(() => agentRequest('test', request));
  expect(response.status).toBe(429);
  expect(request).toHaveBeenCalledTimes(1);
});
