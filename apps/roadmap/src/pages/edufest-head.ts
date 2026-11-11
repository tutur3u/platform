import en from '../../messages/edufest-2026.en.json';
import vi from '../../messages/edufest-2026.vi.json';
import ogImage from '../assets/og-edufest-2026.png?no-inline';
import type { Lang } from '../components/shared';
import { WORKSHOP_EVENT } from '../content/workshops/edufest-2026';
import { heroFontPreloads } from '../hero-fonts';
import { liteModeScript } from '../lite-mode';
import {
  alternateLinks,
  jsonLdScript,
  socialMeta,
  workshopJsonLd,
} from '../seo';

/** Per-language head: title, description, previews, alternates, Event JSON-LD. */
export function edufestHead(lang: Lang) {
  const t = lang === 'en' ? en : vi;
  return {
    meta: socialMeta({
      page: 'edufest',
      lang,
      title: t.meta.title,
      description: t.meta.description,
      image: ogImage,
      imageAlt: t.meta.title,
    }),
    links: [...heroFontPreloads(lang), ...alternateLinks('edufest', lang)],
    scripts: [
      liteModeScript(),
      ...(WORKSHOP_EVENT.isoDate
        ? [
            jsonLdScript(
              workshopJsonLd({
                lang,
                title: t.meta.title,
                description: t.meta.description,
                image: ogImage,
                facts: { isoDate: WORKSHOP_EVENT.isoDate, ...t.seo.place },
                crumbs: { home: t.seo.crumbHome, roadmap: t.seo.crumbRoadmap },
              })
            ),
          ]
        : []),
    ],
  };
}
