/** D79: search metadata, structured data and the sitemap. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import eduEn from '../messages/edufest-2026.en.json' with { type: 'json' };
import eduVi from '../messages/edufest-2026.vi.json' with { type: 'json' };
import en from '../messages/en.json' with { type: 'json' };
import vi from '../messages/vi.json' with { type: 'json' };
import { tracks } from './content/tracks.ts';
import {
  alternateLinks,
  jsonLd,
  langFromPathname,
  pageUrl,
  roadmapJsonLd,
  sitemapXml,
  socialMeta,
  workshopJsonLd,
} from './seo.ts';

const eventFor = (lang: 'en' | 'vi') => {
  const t = lang === 'en' ? eduEn : eduVi;
  return workshopJsonLd({
    lang,
    title: t.meta.title,
    description: t.meta.description,
    image: '/roadmap/assets/og-edufest-2026-abc12345.png',
    facts: { isoDate: '2026-12-05', ...t.seo.place },
    crumbs: { home: t.seo.crumbHome, roadmap: t.seo.crumbRoadmap },
  });
};

describe('SEO: one URL per page and language', () => {
  it('each language is canonical to itself, with en, vi and x-default alternates', () => {
    for (const page of ['roadmap', 'edufest'] as const)
      for (const lang of ['en', 'vi'] as const) {
        const links = alternateLinks(page, lang);
        assert.deepEqual(links[0], {
          rel: 'canonical',
          href: pageUrl(page, lang),
        });
        const alt = Object.fromEntries(
          links.slice(1).map((link) => [link.hrefLang, link.href])
        );
        assert.deepEqual(alt, {
          en: pageUrl(page, 'en'),
          vi: pageUrl(page, 'vi'),
          'x-default': pageUrl(page, 'en'),
        });
        for (const link of links) assert.ok(!link.href.endsWith('/'));
      }
    assert.equal(pageUrl('roadmap', 'vi'), 'https://tuturuuu.com/roadmap/vi');
    assert.equal(
      pageUrl('edufest', 'vi'),
      'https://tuturuuu.com/roadmap/vi/workshops/edufest-2026'
    );
  });

  it('reads the language from the path', () => {
    assert.equal(langFromPathname('/roadmap/vi'), 'vi');
    assert.equal(langFromPathname('/vi/workshops/edufest-2026'), 'vi');
    assert.equal(langFromPathname('/roadmap'), 'en');
    assert.equal(langFromPathname('/workshops/edufest-2026'), 'en');
    // Broken variant: a path that merely starts with "vi" is not Vietnamese.
    assert.equal(langFromPathname('/roadmap/video'), 'en');
  });

  it('previews use an absolute image and the page locale', () => {
    const meta = socialMeta({
      page: 'edufest',
      lang: 'vi',
      title: 'T',
      description: 'D',
      image: '/roadmap/assets/og.png',
      imageAlt: 'A',
    });
    const get = (key: string) =>
      meta.find(
        (item) =>
          ('property' in item && item.property === key) ||
          ('name' in item && item.name === key)
      );
    assert.equal(
      get('og:image')?.content,
      'https://tuturuuu.com/roadmap/assets/og.png'
    );
    assert.equal(get('og:locale')?.content, 'vi_VN');
    assert.equal(get('og:locale:alternate')?.content, 'en_GB');
    assert.equal(get('og:url')?.content, pageUrl('edufest', 'vi'));
  });
});

describe('SEO: copy', () => {
  it('titles and descriptions are unique per page and language, and fit search results', () => {
    const pages = [en.meta, vi.meta, eduEn.meta, eduVi.meta];
    assert.equal(new Set(pages.map((meta) => meta.title)).size, 4);
    assert.equal(new Set(pages.map((meta) => meta.description)).size, 4);
    for (const meta of pages) {
      assert.ok(meta.title.length <= 60, meta.title);
      assert.ok(meta.description.length <= 200, meta.description);
    }
  });

  it('Vietnamese copy carries its search terms naturally, each once', () => {
    const text = `${eduVi.meta.title} ${eduVi.meta.description}`;
    for (const term of [
      'AI cho giáo dục',
      'Agentic AI',
      'EduFest 2026',
      'RMIT',
    ])
      assert.ok(text.includes(term), term);
    // Not stuffed: no term repeats in the description.
    for (const term of ['AI cho giáo dục', 'Agentic AI', 'RMIT'])
      assert.equal(eduVi.meta.description.split(term).length - 1, 1, term);
  });
});

describe('SEO: structured data', () => {
  it('the workshop is a scheduled, in-person Event with the confirmed date and venue, and no price', () => {
    for (const lang of ['en', 'vi'] as const) {
      const [event, crumbs] = eventFor(lang)['@graph'] as unknown as [
        Record<string, any>,
        Record<string, any>,
      ];
      assert.equal(event['@type'], 'Event');
      assert.equal(event.startDate, '2026-12-05');
      assert.equal(event.eventStatus, 'https://schema.org/EventScheduled');
      assert.equal(
        event.eventAttendanceMode,
        'https://schema.org/OfflineEventAttendanceMode'
      );
      assert.equal(event.location['@type'], 'Place');
      assert.match(event.location.name, /RMIT/);
      assert.match(event.location.address.streetAddress, /^702 Nguy/);
      assert.equal(event.location.address.addressCountry, 'VN');
      assert.equal(event.offers.availability, 'https://schema.org/PreOrder');
      assert.equal(event.organizer.name, 'Tuturuuu');
      assert.equal(event.url, pageUrl('edufest', lang));
      assert.match(event.image[0], /^https:\/\/tuturuuu\.com\//);
      assert.equal(crumbs['@type'], 'BreadcrumbList');
      assert.equal(crumbs.itemListElement.length, 3);
      assert.equal(crumbs.itemListElement[2].item, pageUrl('edufest', lang));
    }
    // Registration is not open: no price anywhere in the data.
    assert.doesNotMatch(JSON.stringify(eventFor('en')), /"price/);
  });

  it('the roadmap is a WebPage listing every product track, with breadcrumbs', () => {
    const data = roadmapJsonLd({
      lang: 'en',
      title: en.meta.title,
      description: en.meta.description,
      tracks: tracks.map((track) => ({ id: track.id, name: track.name })),
      crumbs: { home: en.meta.crumbHome, roadmap: en.meta.crumbRoadmap },
    });
    const [page, crumbs] = data['@graph'] as unknown as [
      Record<string, any>,
      Record<string, any>,
    ];
    assert.equal(page['@type'], 'WebPage');
    assert.equal(page.mainEntity.numberOfItems, tracks.length);
    assert.equal(
      page.mainEntity.itemListElement[0].url,
      `${pageUrl('roadmap', 'en')}#track-${tracks[0]?.id}`
    );
    assert.equal(crumbs.itemListElement.length, 2);
  });

  it('JSON-LD cannot close its script element', () => {
    const out = jsonLd({ name: '</script><script>alert(1)</script>' });
    assert.ok(!out.includes('</script'));
    assert.deepEqual(JSON.parse(out), {
      name: '</script><script>alert(1)</script>',
    });
  });
});

describe('SEO: sitemap', () => {
  it('lists every page in both languages with alternates and the deploy time', () => {
    const xml = sitemapXml('2026-11-11T08:00:00.000Z');
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    assert.deepEqual(
      locs.sort(),
      [
        pageUrl('roadmap', 'en'),
        pageUrl('roadmap', 'vi'),
        pageUrl('edufest', 'en'),
        pageUrl('edufest', 'vi'),
      ].sort()
    );
    assert.equal(
      xml.split('<lastmod>2026-11-11T08:00:00.000Z</lastmod>').length - 1,
      4
    );
    assert.equal(xml.split('hreflang="x-default"').length - 1, 4);
    assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
    // Without a build time there is no invented lastmod.
    assert.ok(!sitemapXml(null).includes('<lastmod>'));
  });
});

describe('SEO: hero font preloads', () => {
  it('preload exactly the shell font files the CSS loads, and VI adds its subset', async () => {
    const { readFileSync } = await import('node:fs');
    const source = readFileSync(
      new URL('./hero-fonts.ts', import.meta.url),
      'utf8'
    );
    const fontsCss = readFileSync(
      new URL(
        '../../../packages/marketing-shell/src/fonts.css',
        import.meta.url
      ),
      'utf8'
    );
    const files = [
      ...source.matchAll(/marketing-shell\/fonts\/([a-z0-9-]+\.woff2)\?url/g),
    ].map((match) => match[1]);
    assert.deepEqual(files.sort(), [
      'be-vietnam-pro-500-latin.woff2',
      'be-vietnam-pro-500-vietnamese.woff2',
      'be-vietnam-pro-600-latin.woff2',
      'be-vietnam-pro-600-vietnamese.woff2',
    ]);
    for (const file of files)
      assert.ok(
        fontsCss.includes(`./fonts/${file}`),
        `${file} is not in fonts.css`
      );
    // English pages do not download the Vietnamese subset.
    const en = source.slice(source.indexOf(': ['), source.indexOf('];'));
    assert.ok(!/vietnamese/.test(en.split(']')[1] ?? ''), en);
  });
});
