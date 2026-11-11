import { createFileRoute } from '@tanstack/react-router';
import {
  createTranslator,
  MarketingShell,
  shellNavOffset,
} from '@tuturuuu/marketing-shell';
import { useCallback, useMemo, useState, type CSSProperties } from 'react';
import en from '../../messages/en.json';
import vi from '../../messages/vi.json';
import { Footer } from '../components/chrome';
import logo from '../assets/tuturuuu-logo.png?no-inline';
import { ComingSoon, Hero } from '../components/hero';
import { TrackGlance } from '../components/pulse';
import { HostingSection, Method } from '../components/hosting';
import type { Lang } from '../components/shared';
import { TimelineSection } from '../components/timeline';
import { TracksSection } from '../components/tracks';
import ogImage from '../assets/og-roadmap.png?no-inline';
import historyUrl from '../generated/history.json?url';
import { initialLiveData } from '../live/initial-data';
import { useLiveData } from '../live/use-live-data';
import { buildView, type StatusFilter } from '../view-model';

/** Canonical: no trailing slash, like every Tuturuuu URL. */
const ROADMAP_URL = 'https://tuturuuu.com/roadmap';
const ROADMAP_DESCRIPTION =
  'What Tuturuuu is building: every product track, milestone and deliverable, with what shipped this week, live from public pull requests and deploy checks.';

export const Route = createFileRoute('/')({
  head: () => ({
    meta: [
      { title: 'Roadmap · Tuturuuu' },
      { property: 'og:title', content: 'Roadmap · Tuturuuu' },
      { property: 'og:url', content: ROADMAP_URL },
      { name: 'description', content: ROADMAP_DESCRIPTION },
      { property: 'og:description', content: ROADMAP_DESCRIPTION },
      // Absolute: link previews fetch it without the page's base URL.
      { property: 'og:image', content: `https://tuturuuu.com${ogImage}` },
      { property: 'og:image:width', content: '1200' },
      { property: 'og:image:height', content: '630' },
      {
        property: 'og:image:alt',
        content: 'Tuturuuu Roadmap: what is shipping now',
      },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:title', content: 'Roadmap · Tuturuuu' },
      { name: 'twitter:description', content: ROADMAP_DESCRIPTION },
      { name: 'twitter:image', content: `https://tuturuuu.com${ogImage}` },
    ],
    links: [
      // Full history for the timeline: hashed, immutable, fetched at idle.
      { rel: 'prefetch', href: historyUrl, as: 'fetch' },
      { rel: 'canonical', href: ROADMAP_URL },
      // One URL serves both languages (the EN/VI switch is client-side).
      { rel: 'alternate', hrefLang: 'en', href: ROADMAP_URL },
      { rel: 'alternate', hrefLang: 'vi', href: ROADMAP_URL },
      { rel: 'alternate', hrefLang: 'x-default', href: ROADMAP_URL },
    ],
  }),
  component: RoadmapPage,
});

function RoadmapPage() {
  const [lang, setLang] = useState<Lang>('en');
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
        pathname="/roadmap"
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
