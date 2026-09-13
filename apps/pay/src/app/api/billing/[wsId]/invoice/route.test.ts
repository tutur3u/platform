import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';

const access = vi.hoisted(() => vi.fn());
vi.mock('@tuturuuu/satellite/workspace-access', () => ({
  getSatelliteRequestWorkspaceAccess: access,
}));

import { GET } from './route';

const request = () =>
  GET(
    new NextRequest('https://pay.tuturuuu.com/api/billing/personal/invoice'),
    { params: Promise.resolve({ wsId: 'personal' }) }
  );
describe('legacy receipt URL', () => {
  it('does not expose receipts without workspace access', async () => {
    access.mockResolvedValue(null);
    expect((await request()).status).toBe(404);
  });
  it('redirects to actual invoice history without fabricating paid amounts', async () => {
    const from = vi.fn();
    access.mockResolvedValue({ wsId: 'resolved-workspace', admin: { from } });
    const response = await request();
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'https://pay.tuturuuu.com/resolved-workspace/billing#billing-history'
    );
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(from).not.toHaveBeenCalled();
  });
});
