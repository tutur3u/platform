import { describe, expect, it } from 'vitest';
import {
  isRetiredAppHostname,
  isRetiredAppUrl,
  RETIRED_APP_HOSTNAMES,
} from './retired-app-hosts';

describe('retired app hosts', () => {
  it.each([
    'rewise.me',
    'REWISE.ME',
    'rewise.me.',
    'www.rewise.me',
    'preview.rewise.me',
    'rewise.school',
    'Rewise.School.',
    'app.rewise.school',
  ])('treats %s as retired', (host) => {
    expect(isRetiredAppHostname(host)).toBe(true);
  });

  it.each([
    'rewise.tuturuuu.com',
    'rewise.tutur3u.com',
    'rewise.tuturuuu.localhost',
    'evilrewise.me',
    'rewise.me.evil.com',
    'rewise.schools',
    'nova.ai.vn',
  ])('does not treat %s as retired', (host) => {
    expect(isRetiredAppHostname(host)).toBe(false);
  });

  it.each([
    'https://rewise.me',
    'http://rewise.me/login',
    'https://rewise.me:444/',
    'https://user:password@rewise.school/x',
    'wss://live.rewise.school',
  ])('detects retired URL %s', (url) => {
    expect(isRetiredAppUrl(url)).toBe(true);
  });

  it('ignores unparseable and non-retired URLs', () => {
    expect(isRetiredAppUrl('rewise.me')).toBe(false);
    expect(isRetiredAppUrl('https://rewise.me@evil.com')).toBe(false);
    expect(isRetiredAppUrl('https://rewise.tuturuuu.com')).toBe(false);
  });

  it('lists exactly the domains Tuturuuu let go', () => {
    expect(RETIRED_APP_HOSTNAMES).toEqual(['rewise.me', 'rewise.school']);
  });
});
