import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  withSessionAuth: vi.fn(() => vi.fn()),
}));

vi.mock('@/lib/api-auth', () => ({
  withSessionAuth: mocks.withSessionAuth,
}));

import './route';

describe('workspace AI credits route authentication', () => {
  it('accepts the Pay satellite app session', () => {
    expect(mocks.withSessionAuth).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        allowAppSessionAuth: {
          targetApp: ['chat', 'mind', 'pay', 'tasks'],
        },
      })
    );
  });
});
