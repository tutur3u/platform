import { describe, expect, it } from 'vitest';
import { buildMeetOgContent, meetOgVersion } from './og-content';

const info = {
  title: 'Weekly sync',
  scheduledAt: '2026-11-23T14:05:00Z',
  ended: false,
};

describe('buildMeetOgContent', () => {
  it('returns the generic card for a private or unknown room', () => {
    const content = buildMeetOgContent({ kind: 'room', info: null }, 'en');
    expect(content.variant).toBe('generic');
    expect(content.title).toBe('Join a meeting');
    expect(JSON.stringify(content)).not.toContain('Weekly sync');
    expect(content.footer).toBe('tuturuuu.com/meet');
  });
  it('treats a blank public title as generic', () => {
    expect(
      buildMeetOgContent({ kind: 'room', info: { ...info, title: '  ' } }, 'en')
        .variant
    ).toBe('generic');
  });
  it('shows title and UTC schedule for a public room', () => {
    const content = buildMeetOgContent({ kind: 'room', info }, 'en');
    expect(content).toMatchObject({
      variant: 'detailed',
      eyebrow: 'You are invited',
      title: 'Weekly sync',
      detail: '23 Nov 2026 · 14:05 UTC',
      cta: 'Join meeting',
    });
  });
  it('localizes to Vietnamese', () => {
    const content = buildMeetOgContent({ kind: 'room', info }, 'vi');
    expect(content.eyebrow).toBe('Bạn được mời tham gia');
    expect(content.detail).toBe('14:05 UTC, 23 thg 11 2026');
    expect(content.cta).toBe('Tham gia cuộc họp');
  });
  it('omits the schedule for ended or invalid times', () => {
    expect(
      buildMeetOgContent({ kind: 'room', info: { ...info, ended: true } }, 'en')
        .detail
    ).toBeNull();
    expect(
      buildMeetOgContent(
        { kind: 'room', info: { ...info, scheduledAt: 'nope' } },
        'en'
      ).detail
    ).toBeNull();
  });
  it('clips very long titles', () => {
    const content = buildMeetOgContent(
      { kind: 'room', info: { ...info, title: 'x'.repeat(300) } },
      'en'
    );
    expect(content.title.length).toBeLessThanOrEqual(110);
    expect(content.titleSize).toBe(48);
  });
  it('keys the version on what the image shows', () => {
    const a = buildMeetOgContent({ kind: 'room', info }, 'en');
    const b = buildMeetOgContent(
      { kind: 'room', info: { ...info, title: 'Other' } },
      'en'
    );
    expect(meetOgVersion(a)).toBe(meetOgVersion(a));
    expect(meetOgVersion(a)).not.toBe(meetOgVersion(b));
    expect(
      meetOgVersion(buildMeetOgContent({ kind: 'landing' }, 'en'))
    ).not.toBe(meetOgVersion(buildMeetOgContent({ kind: 'landing' }, 'vi')));
  });
});
