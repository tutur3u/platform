import { afterEach, expect, it, vi } from 'vitest';
import { meetReviewUrl } from './meet-links';

afterEach(() => vi.unstubAllEnvs());
it('rejects a Parley origin configured for the shared runtime', () => {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('MEET_APP_URL', 'https://parley.tuturuuu.com');
  vi.stubEnv('NEXT_PUBLIC_MEET_APP_URL', '');
  expect(meetReviewUrl('workspace', 'meeting')).toBe(
    'https://meet.tuturuuu.com/workspace/meetings/meeting'
  );
});
it('preserves an explicitly configured local Meet origin', () => {
  vi.stubEnv('MEET_APP_URL', 'http://localhost:7807/');
  expect(meetReviewUrl('workspace', 'meeting')).toBe(
    'http://localhost:7807/workspace/meetings/meeting'
  );
});
