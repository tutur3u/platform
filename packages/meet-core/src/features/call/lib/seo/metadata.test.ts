import { describe, expect, it } from 'vitest';
import { encodeRoomCode } from '../room-code';
import { buildMeetSeo } from './metadata';
import { meetSeoToNextMetadata } from './next-metadata';
import { meetSeoToHeadMeta } from './page-meta';

const id = '00000000-0000-4000-8000-000000000001';
const code = encodeRoomCode(id);
const info = {
  title: 'Weekly sync',
  scheduledAt: '2026-11-23T14:05:00Z',
  ended: false,
};

describe('buildMeetSeo', () => {
  it('keeps a private room generic, noindex and on the canonical domain', () => {
    const seo = buildMeetSeo({ kind: 'room', code, info: null }, 'en');
    expect(seo.title).toBe('Join a meeting | Tuturuuu Meet');
    expect(seo.description).toBe('Join a meeting on Tuturuuu Meet.');
    expect(seo.indexable).toBe(false);
    expect(seo.canonical).toBe(`https://tuturuuu.com/meet/r/${code}`);
    expect(JSON.stringify(seo)).not.toContain('Weekly sync');
  });
  it('uses public title and UTC schedule but stays noindex', () => {
    const seo = buildMeetSeo({ kind: 'room', code, info }, 'en');
    expect(seo.title).toBe('Weekly sync | Tuturuuu Meet');
    expect(seo.description).toContain('23 Nov 2026 · 14:05 UTC');
    expect(seo.indexable).toBe(false);
  });
  it('never emits the legacy domain', () => {
    for (const surface of [
      { kind: 'room', code, info } as const,
      { kind: 'room', code, info: null } as const,
      { kind: 'landing' } as const,
    ]) {
      for (const locale of ['en', 'vi']) {
        const seo = buildMeetSeo(surface, locale);
        const text = JSON.stringify([
          seo,
          meetSeoToNextMetadata(seo),
          meetSeoToHeadMeta(seo),
        ]);
        expect(text).not.toContain('meet.tuturuuu.com');
        expect(text).toContain('https://tuturuuu.com/meet');
      }
    }
  });
  it('localizes Vietnamese copy, locale and hreflang alternates', () => {
    const seo = buildMeetSeo({ kind: 'room', code, info: null }, 'vi');
    expect(seo.title).toBe('Tham gia cuộc họp | Tuturuuu Meet');
    expect(seo.openGraph.locale).toBe('vi_VN');
    expect(seo.canonical).toBe(`https://tuturuuu.com/meet/vi/r/${code}`);
    expect(seo.languages).toEqual({
      en: `https://tuturuuu.com/meet/r/${code}`,
      vi: `https://tuturuuu.com/meet/vi/r/${code}`,
      'x-default': `https://tuturuuu.com/meet/r/${code}`,
    });
  });
  it('indexes only the landing page, with its own OG image', () => {
    const seo = buildMeetSeo({ kind: 'landing' }, 'en');
    expect(seo.indexable).toBe(true);
    expect(seo.canonical).toBe('https://tuturuuu.com/meet');
    expect(seo.openGraph.image.url).toMatch(
      /^https:\/\/tuturuuu\.com\/meet\/og\?lang=en&v=/u
    );
    expect(buildMeetSeo({ kind: 'page', path: '/login' }, 'en').indexable).toBe(
      false
    );
  });
  it('points room images at the preview route keyed on the shown content', () => {
    const a = buildMeetSeo({ kind: 'room', code, info }, 'en');
    const b = buildMeetSeo({ kind: 'room', code, info: null }, 'en');
    expect(a.openGraph.image.url).toContain(
      `/meet/r/${code}/preview?lang=en&v=`
    );
    expect(a.openGraph.image.url).not.toBe(b.openGraph.image.url);
  });
  it('emits og, twitter and robots tags for both runtimes', () => {
    const seo = buildMeetSeo({ kind: 'room', code, info: null }, 'en');
    const next = meetSeoToNextMetadata(seo);
    expect(next.twitter).toMatchObject({ card: 'summary_large_image' });
    expect(next.openGraph).toMatchObject({
      siteName: 'Tuturuuu Meet',
      url: seo.canonical,
    });
    expect(next.alternates?.languages).toBeDefined();
    const head = meetSeoToHeadMeta(seo);
    const names = head.meta.map((m) => ('name' in m ? m.name : m.property));
    expect(names).toEqual(
      expect.arrayContaining([
        'robots',
        'og:url',
        'og:site_name',
        'og:locale',
        'twitter:card',
        'twitter:image',
      ])
    );
    expect(head.links.filter((l) => l.rel === 'alternate')).toHaveLength(3);
  });
});
