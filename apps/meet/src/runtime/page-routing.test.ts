import { describe, expect, it } from 'vitest';
import { matchMeetPage } from './page-routing';

describe('Meet generated page ownership', () => {
  it.each(['', '/en', '/vi'])(
    'routes existing pages after the %s locale prefix',
    (locale) => {
      expect(matchMeetPage(`${locale}/`)?.kind).toBe('public-plans');
      expect(matchMeetPage(`${locale}/personal`)?.kind).toBe('workspace');
      expect(matchMeetPage(`${locale}/personal/meetings`)?.kind).toBe(
        'meetings'
      );
      expect(matchMeetPage(`${locale}/personal/meetings/one`)?.kind).toBe(
        'meeting'
      );
      expect(matchMeetPage(`${locale}/personal/plans`)?.kind).toBe(
        'workspace-plans'
      );
      expect(matchMeetPage(`${locale}/plans/one`)?.kind).toBe('plan');
      expect(matchMeetPage(`${locale}/r/code`)?.kind).toBe('room');
      expect(matchMeetPage(`${locale}/login`)?.kind).toBe('login');
      expect(matchMeetPage(`${locale}/verify-token`)?.kind).toBe(
        'verify-token'
      );
      expect(matchMeetPage(`${locale}/native-collaboration`)?.kind).toBe(
        'native-collaboration'
      );
    }
  );

  it('rejects unregistered descendants and preserves explicit locale', () => {
    expect(matchMeetPage('/vi/r/code')?.locale).toBe('vi');
    expect(matchMeetPage('/r/code')?.locale).toBeUndefined();
    expect(matchMeetPage('/personal/other')).toBeNull();
    expect(matchMeetPage('/personal/meetings/one/extra')).toBeNull();
    expect(matchMeetPage('/api/meet-call/one')).toBeNull();
  });
});
