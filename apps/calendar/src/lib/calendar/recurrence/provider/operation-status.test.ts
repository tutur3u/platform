import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ result: vi.fn() }));
vi.mock('../http', () => ({ seriesResult: mocks.result }));
vi.mock('../../../workspace-encryption', () => ({
  encryptEventForStorage: vi.fn(),
}));
vi.mock('../../source-resolver', () => ({
  resolveCalendarSource: vi.fn(),
  isCalendarPreviewSourceEnabled: vi.fn(),
}));
vi.mock('../../token-refresh', () => ({ ensureValidToken: vi.fn() }));
vi.mock('../../provider-writes', () => ({ createGoogleAuthClient: vi.fn() }));

import { publicProviderOperation } from './request-service';
import type { ProviderOperation } from './store';

const operation = {
  id: 'operation',
  phase: 'prepared',
  journal: { ciphertext: 'encrypted-journal' },
  native_input: { payload: { title: 'encrypted-title' } },
  result: null,
} as unknown as ProviderOperation;
beforeEach(() => vi.clearAllMocks());
describe('public provider operation status', () => {
  it('exposes no stored journal or encrypted event fields while pending', async () => {
    expect(await publicProviderOperation(operation)).toEqual({
      operationId: 'operation',
      status: 'pending',
    });
    expect(mocks.result).not.toHaveBeenCalled();
  });
  it('hydrates the native receipt instead of sending encrypted payloads', async () => {
    const raw = { payload: { title: 'encrypted-title' } };
    mocks.result.mockResolvedValue({ payload: { title: 'Decrypted' } });
    expect(
      await publicProviderOperation({
        ...operation,
        phase: 'applied',
        result: raw,
      })
    ).toEqual({
      operationId: 'operation',
      status: 'applied',
      result: { payload: { title: 'Decrypted' } },
    });
    expect(mocks.result).toHaveBeenCalledWith(raw);
  });
});
