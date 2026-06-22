import { describe, expect, it, vi } from 'vitest';
import {
  createNextCompatRouter,
  type RouterLike,
} from './next-navigation-shim';

function makeFakeRouter() {
  const navigate =
    vi.fn<(options: { href: string; replace?: boolean }) => unknown>();
  const invalidate = vi.fn<() => unknown>();
  const back = vi.fn<() => void>();
  const forward = vi.fn<() => void>();
  const router: RouterLike = {
    history: { back, forward },
    invalidate,
    navigate,
  };
  return { back, forward, invalidate, navigate, router };
}

describe('createNextCompatRouter', () => {
  it('maps push(href) -> navigate({ href }) (no replace)', () => {
    const { navigate, router } = makeFakeRouter();
    createNextCompatRouter(router).push('/en/ws/tasks');
    expect(navigate).toHaveBeenCalledWith({ href: '/en/ws/tasks' });
  });

  it('maps replace(href) -> navigate({ href, replace: true })', () => {
    const { navigate, router } = makeFakeRouter();
    createNextCompatRouter(router).replace('/en/login');
    expect(navigate).toHaveBeenCalledWith({
      href: '/en/login',
      replace: true,
    });
  });

  it('maps refresh() -> invalidate()', () => {
    const { invalidate, navigate, router } = makeFakeRouter();
    createNextCompatRouter(router).refresh();
    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('maps back()/forward() -> history.back()/forward()', () => {
    const { back, forward, router } = makeFakeRouter();
    const compat = createNextCompatRouter(router);
    compat.back();
    compat.forward();
    expect(back).toHaveBeenCalledTimes(1);
    expect(forward).toHaveBeenCalledTimes(1);
  });

  it('treats prefetch() as a safe no-op (does not navigate)', () => {
    const { invalidate, navigate, router } = makeFakeRouter();
    expect(() =>
      createNextCompatRouter(router).prefetch('/en/ws/tasks')
    ).not.toThrow();
    expect(navigate).not.toHaveBeenCalled();
    expect(invalidate).not.toHaveBeenCalled();
  });
});
