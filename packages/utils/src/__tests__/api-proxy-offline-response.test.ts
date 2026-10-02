import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';

const guard = vi.hoisted(() => vi.fn());
vi.mock('../required-mfa-runtime', () => ({
  enforceRequiredMfaRequest: async () => null,
}));
vi.mock('../offline-download-guard', () => ({
  guardOfflineDownloadRequest: guard,
}));

import { guardApiProxyRequest } from '../api-proxy-guard';
import { isFinanceInvoiceCreateSupportRead } from '../api-proxy-read-policy';

describe('offline guard proxy integration', () => {
  it('propagates a download challenge without continuing the request', async () => {
    const challenge = Response.json(
      { message: 'Verify download' },
      { status: 403 }
    );
    guard.mockResolvedValueOnce(challenge);
    const request = new NextRequest(
      'https://example.test/api/v1/workspaces/ws/tasks'
    );
    expect(
      await guardApiProxyRequest(request, { prefixBase: 'test:offline' })
    ).toBe(challenge);
    expect(guard).toHaveBeenCalledWith(request);
  });
  it.each(['permissions', 'members'])(
    'excludes static settings/%s from invoice reads',
    (name) => {
      const request = new NextRequest(
        `https://example.test/api/v1/workspaces/ws/settings/${name}`
      );
      expect(isFinanceInvoiceCreateSupportRead(request)).toBe(false);
    }
  );
  it.each(['configs', 'custom-config'])(
    'retains supported settings/%s invoice reads',
    (name) => {
      const request = new NextRequest(
        `https://example.test/api/v1/workspaces/ws/settings/${name}`
      );
      expect(isFinanceInvoiceCreateSupportRead(request)).toBe(true);
    }
  );
});
