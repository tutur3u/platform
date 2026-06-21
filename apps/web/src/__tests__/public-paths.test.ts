import { describe, expect, it } from 'vitest';
import { APP_PUBLIC_PATHS } from '@/constants/public_paths';

describe('app public paths', () => {
  it('allows unauthenticated access to the UI showcase routes', () => {
    expect(APP_PUBLIC_PATHS).toEqual(
      expect.arrayContaining(['/ui', '/en/ui', '/vi/ui'])
    );
  });

  it('allows unauthenticated access to the docs redirect route', () => {
    expect(APP_PUBLIC_PATHS).toEqual(
      expect.arrayContaining(['/docs', '/en/docs', '/vi/docs'])
    );
  });
});
