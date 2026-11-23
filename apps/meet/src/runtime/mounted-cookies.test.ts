import { describe, expect, it } from 'vitest';
import { mountedMeetCookieHeader } from './mounted-cookies';

describe('mountedMeetCookieHeader', () => {
  it("keeps Meet's own locale copy ahead of Web's", () => {
    const header = mountedMeetCookieHeader(
      'NEXT_LOCALE=vi; theme=dark; NEXT_LOCALE=en'
    );
    expect(header).toBe('NEXT_LOCALE=vi; theme=dark');
  });

  it('drops cookies a mounted app may not read', () => {
    const header = mountedMeetCookieHeader(
      'tuturuuu_app_session=secret; NEXT_LOCALE=en'
    );
    expect(header).not.toContain('secret');
    expect(header).toContain('NEXT_LOCALE=en');
  });
});
