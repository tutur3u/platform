import { isValidElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  connection: vi.fn(),
}));

vi.mock('next/server', () => ({
  connection: (...args: Parameters<typeof mocks.connection>) =>
    mocks.connection(...args),
}));

import UsersLayout from './layout';

describe('users segment layout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.connection.mockResolvedValue(undefined);
  });

  it('opts authenticated users routes out of prerendering', async () => {
    const children = <div data-testid="users-child" />;

    const result = await UsersLayout({ children });

    expect(mocks.connection).toHaveBeenCalledOnce();
    expect(isValidElement(result)).toBe(true);
    expect(result).toBe(children);
  });
});
