import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  }),
}));

vi.mock('next/navigation', () => ({
  redirect: mocks.redirect,
}));

describe('Infrastructure locale root page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('redirects to the internal root workspace', async () => {
    const Page = (await import('./page')).default;

    expect(() => Page()).toThrow('redirect:/internal');
    expect(mocks.redirect).toHaveBeenCalledWith('/internal');
  });
});
