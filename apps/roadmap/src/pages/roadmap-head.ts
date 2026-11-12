import en from '../../messages/en.json';
import vi from '../../messages/vi.json';
import ogImage from '../assets/og-roadmap.png?no-inline';
import type { Lang } from '../components/shared';
import { tracks } from '../content/tracks';
import { heroFontPreloads } from '../hero-fonts';
import { liteModeScript } from '../lite-mode';
import {
  alternateLinks,
  jsonLdScript,
  roadmapJsonLd,
  socialMeta,
} from '../seo';

/** Per-language head: title, description, previews, alternates, JSON-LD. */
export function roadmapHead(lang: Lang) {
  const t = lang === 'en' ? en : vi;
  return {
    meta: socialMeta({
      page: 'roadmap',
      lang,
      title: t.meta.title,
      description: t.meta.description,
      image: ogImage,
      imageAlt: t.meta.imageAlt,
    }),
    links: [...heroFontPreloads(lang), ...alternateLinks('roadmap', lang)],
    scripts: [
      liteModeScript(),
      jsonLdScript(
        roadmapJsonLd({
          lang,
          title: t.meta.title,
          description: t.meta.description,
          tracks: tracks.map((track) => ({ id: track.id, name: track.name })),
          crumbs: { home: t.meta.crumbHome, roadmap: t.meta.crumbRoadmap },
        })
      ),
    ],
  };
}
