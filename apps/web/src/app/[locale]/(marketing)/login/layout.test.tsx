import { isValidElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  connection: vi.fn(),
}));

vi.mock('next/server', () => ({
  connection: (...args: Parameters<typeof mocks.connection>) =>
    mocks.connection(...args),
}));

import LoginLayout from './layout';

describe('login segment layout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.connection.mockResolvedValue(undefined);
  });

  it('opts the authenticated login route out of prerendering', async () => {
    const children = <div data-testid="login-child" />;

    const result = await LoginLayout({ children });

    expect(mocks.connection).toHaveBeenCalledOnce();
    expect(isValidElement(result)).toBe(true);
    expect(result).toBe(children);
  });
});
