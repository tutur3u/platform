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
import { HostingSection, Method } from '../components/hosting';
import type { Lang } from '../components/shared';
import { TimelineSection } from '../components/timeline';
import { TracksSection } from '../components/tracks';
import historyUrl from '../generated/history.json?url';
import generated from '../generated/live.json';
import { parseLiveData } from '../live/model';
import { useLiveData } from '../live/use-live-data';
import { buildView, type StatusFilter } from '../view-model';

/** Canonical: no trailing slash, like every Tuturuuu URL. */
const ROADMAP_URL = 'https://tuturuuu.com/roadmap';

export const Route = createFileRoute('/')({
  head: () => ({
    meta: [
      { title: 'Roadmap · Tuturuuu' },
      { property: 'og:title', content: 'Roadmap · Tuturuuu' },
      { property: 'og:url', content: ROADMAP_URL },
      {
        name: 'description',
        content:
          'What Tuturuuu is building: every product track, milestone and deliverable, with what shipped this week, live from public pull requests and deploy checks.',
      },
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

const initialData = parseLiveData(generated);

function RoadmapPage() {
  const [lang, setLang] = useState<Lang>('en');
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [navCompact, setNavCompact] = useState(false);
  const onDock = useCallback((docked: boolean) => {
    setNavCompact(docked);
  }, []);
  const t = lang === 'en' ? en : vi;
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
          <Hero t={t} view={view} />
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
