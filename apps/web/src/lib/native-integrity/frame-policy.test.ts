// @vitest-environment node
import { expect, it } from 'vitest';
import { createTuturuuuNextConfig } from '../../../../../packages/utils/src/next-config';
import { nativeIntegrityFramablePaths } from './frame-policy';

it('excludes only the exact native bridge from the real platform anti-framing policy', async () => {
  const config = createTuturuuuNextConfig({
    framablePathPatterns: nativeIntegrityFramablePaths,
  });
  const headers = await config.headers?.();
  const deny = headers?.find((rule) =>
    rule.headers.some((header) => header.key === 'X-Frame-Options')
  );
  expect(deny).toBeDefined();
  const source = deny?.source ?? '';
  const matchesDeny = new RegExp(`^${source.slice('/:path('.length, -1)}$`);
  expect(matchesDeny.test('native-integrity/turnstile')).toBe(false);
  expect(matchesDeny.test('native-integrity/turnstile/evil')).toBe(true);
  expect(matchesDeny.test('native-integrity/turnstile-suffix')).toBe(true);
  expect(matchesDeny.test('login')).toBe(true);
  expect(matchesDeny.test('api/v1/users/calendar-settings')).toBe(true);
});
