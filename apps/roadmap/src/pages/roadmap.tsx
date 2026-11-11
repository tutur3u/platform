import { useNavigate } from '@tanstack/react-router';
import {
  createTranslator,
  MarketingShell,
  shellNavOffset,
} from '@tuturuuu/marketing-shell';
import { type CSSProperties, useCallback, useMemo, useState } from 'react';
import en from '../../messages/en.json';
import vi from '../../messages/vi.json';
import ogImage from '../assets/og-roadmap.png?no-inline';
import logo from '../assets/tuturuuu-logo.png?no-inline';
import { Footer } from '../components/chrome';
import { ComingSoon, Hero } from '../components/hero';
import { HostingSection, Method } from '../components/hosting';
import { TrackGlance } from '../components/pulse';
import type { Lang } from '../components/shared';
import { TimelineSection } from '../components/timeline';
import { TracksSection } from '../components/tracks';
import { tracks } from '../content/tracks';
import historyUrl from '../generated/history.json?url';
import { initialLiveData } from '../live/initial-data';
import { useLiveData } from '../live/use-live-data';
import {
  alternateLinks,
  jsonLdScript,
  pagePath,
  ROUTE_PATHS,
  roadmapJsonLd,
  socialMeta,
} from '../seo';
import { buildView, type StatusFilter } from '../view-model';

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
    links: [
      // Full history for the timeline: hashed, immutable, fetched at idle.
      { rel: 'prefetch', href: historyUrl, as: 'fetch' },
      ...alternateLinks('roadmap', lang),
    ],
    scripts: [
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

export function RoadmapPage({ lang }: { lang: Lang }) {
  const navigate = useNavigate();
  const setLang = useCallback(
    (next: Lang) => {
      if (next !== lang)
        void navigate({ to: ROUTE_PATHS.roadmap[next], resetScroll: false });
    },
    [lang, navigate]
  );
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [navCompact, setNavCompact] = useState(false);
  const onDock = useCallback((docked: boolean) => {
    setNavCompact(docked);
  }, []);
  const t = lang === 'en' ? en : vi;
  const initialData = initialLiveData();
  const live = useLiveData(initialData);
  const view = useMemo(
    () => buildView(live.data, live.now),
    [live.data, live.now]
  );

  const shellT = useMemo(() => createTranslator(lang), [lang]);

  return (
    <div
      className="roadmap"
      lang={lang}
      data-source-sha={__ROADMAP_BUILD_SHA__}
      data-nav-compact={navCompact ? '' : undefined}
      style={
        {
          '--shell-nav-offset': `${shellNavOffset(navCompact)}px`,
        } as CSSProperties
      }
    >
      <a className="skip-link" href="#tracks">
        {t.skip}
      </a>
      <MarketingShell
        locale={lang}
        logoSrc={logo}
        onLocaleChange={setLang}
        navCompact={navCompact}
        pathname={pagePath('roadmap', lang)}
        signInHref="https://tuturuuu.com/login"
        t={shellT}
      >
        <main className="page">
          <Hero t={t} view={view} lang={lang} data={live.data} now={live.now} />
          <TrackGlance t={t} view={view} />
          <ComingSoon t={t} />
          <TimelineSection
            t={t}
            lang={lang}
            view={view}
            live={live.data}
            now={live.now}
            mounted={live.mounted}
          />
          <TracksSection
            t={t}
            lang={lang}
            view={view}
            filter={filter}
            setFilter={setFilter}
            onDock={onDock}
          />
          <HostingSection
            t={t}
            lang={lang}
            view={view}
            main={live.data.main}
            hostsCheckedAt={initialData.generatedAt}
          />
          <Method t={t} />
          <Footer
            t={t}
            lang={lang}
            data={live.data}
            liveCheckFailed={live.state === 'failed'}
          />
        </main>
      </MarketingShell>
    </div>
  );
}
