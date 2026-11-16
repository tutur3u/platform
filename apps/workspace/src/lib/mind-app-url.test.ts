import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getMindAppOrigin } from './mind-app-url';

describe('getMindAppOrigin', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('MIND_APP_URL', '');
    vi.stubEnv('NEXT_PUBLIC_MIND_APP_URL', '');
    vi.stubEnv('NEXT_PUBLIC_TUTURUUU_ACTIVE_APP_MOUNTS', '');
  });

  afterEach(() => vi.unstubAllEnvs());

  it('keeps the Mind subdomain while the mount is inactive', () => {
    expect(getMindAppOrigin()).toBe('https://mind.tuturuuu.com');
  });

  it('links to the apex mount once mind is an active app mount', () => {
    vi.stubEnv('NEXT_PUBLIC_TUTURUUU_ACTIVE_APP_MOUNTS', 'tasks, mind');
    expect(getMindAppOrigin()).toBe('https://tuturuuu.com/mind');
  });
});
