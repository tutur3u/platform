import { describe, expect, it, vi } from 'vitest';

const resolve = vi.hoisted(() => vi.fn());
vi.mock('@tuturuuu/satellite/workspace-access', () => ({
  resolveSatelliteRequestActor: resolve,
}));

import { POST } from './route';

describe('seat mutation input boundary', () => {
  it.each(['2', 1.5, 0, -1, 1001, null])(
    'rejects invalid seat quantity %s before contacting billing',
    async (newSeatCount) => {
      const response = await POST(
        new Request('https://pay.tuturuuu.com/api/payment/seats', {
          method: 'POST',
          body: JSON.stringify({ wsId: 'workspace', newSeatCount }),
        })
      );
      expect(response.status).toBe(400);
      expect(resolve).not.toHaveBeenCalled();
    }
  );
});
