import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({ authorize: vi.fn() }));

vi.mock('./authorize', () => ({
  authorizeMiraOperator: (...args: unknown[]) => mocks.authorize(...args),
  miraJson: (body: unknown, status = 200) => Response.json(body, { status }),
}));

import { miraOperatorRoute } from './http';

describe('miraOperatorRoute', () => {
  it('refuses a malformed workspace id before authorization', async () => {
    const response = await miraOperatorRoute('tenant_stop')(
      new Request(
        'https://admin.test/api/v1/infrastructure/mira/tenants/a.b/stop',
        {
          method: 'POST',
        }
      ),
      { params: Promise.resolve({ wsId: 'a.b' }) }
    );
    expect(response.status).toBe(400);
    expect(mocks.authorize).not.toHaveBeenCalled();
  });
});
