import { useNavigate } from '@tanstack/react-router';
import {
  createTranslator,
  MarketingShell,
  shellNavOffset,
} from '@tuturuuu/marketing-shell';
import {
  type CSSProperties,
  memo,
  Suspense,
  useCallback,
  useMemo,
  useState,
} from 'react';
import en from '../../messages/en.json';
import vi from '../../messages/vi.json';
import logo from '../assets/tuturuuu-logo.png?no-inline';
import { Footer } from '../components/chrome';
import { ComingSoon, Hero, OverallBar } from '../components/hero';
import { HostingSection } from '../components/hosting';
import { MigrationSection } from '../components/migration';
import { TrackGlance } from '../components/pulse';
import type { Lang } from '../components/shared';
import { TimelineSection } from '../components/timeline';
import { TracksSection } from '../components/tracks';
import { initialLiveData } from '../live/initial-data';
import type { LiveData } from '../live/model';
import { type LiveState, useLiveData } from '../live/use-live-data';
import { pagePath, ROUTE_PATHS } from '../seo';
import { BUILD_HOSTING } from '../live/build-hosting';
import { buildView } from '../view-model';
import { BUILD_ACTIVITY } from '../insights/build-activity';
import { buildInsights } from '../insights/model';
import { useLazyHistory } from '../insights/use-lazy-history';
import { changelog } from '../changelog/data';
import { ShippedTile } from '../components/insights/kpis';
import { CommitTiles } from '../components/insights/commit-tiles';
import { PulseSection } from '../components/insights/pulse-section';
import {
  ProductionUpdates,
  UpdatesTeaser,
} from '../components/insights/updates';
import { NotesEmpty, PatchNotes } from '../components/insights/patch-notes';
import { shownState } from '../components/live-label';
import { RoadmapTabs, skipToTabs } from '../components/tabs';

export function RoadmapPage({ lang }: { lang: Lang }) {
  const navigate = useNavigate();
  const setLang = useCallback(
    (next: Lang) => {
      if (next !== lang)
        void navigate({ to: ROUTE_PATHS.roadmap[next], resetScroll: false });
    },
    [lang, navigate]
  );
  const [navCompact, setNavCompact] = useState(false);
  const onDock = useCallback((docked: boolean) => {
    setNavCompact(docked);
  }, []);
  const t = lang === 'en' ? en : vi;
  const initialData = initialLiveData();
  const live = useLiveData(initialData);
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
      <a className="skip-link" href="#sections" onClick={skipToTabs}>
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
        <RoadmapMain
          t={t}
          lang={lang}
          data={live.data}
          now={live.now}
          liveState={live.state}
          onDock={onDock}
        />
      </MarketingShell>
    </div>
  );
}

/**
 * Every section, memoised: docking the navbar (a scroll-driven state change
 * on the page) re-renders only the shell, never the 8,000-node track list.
 *
 * A compact hero, then four tabs. Every panel renders on the server, so
 * crawlers, no-JS readers and the live refresh see all of them; the URL
 * fragment picks the visible one (components/tabs.tsx).
 */
const RoadmapMain = memo(function RoadmapMain({
  t,
  lang,
  data,
  now,
  liveState,
  onDock,
}: {
  t: typeof en;
  lang: Lang;
  data: LiveData;
  now: number;
  liveState: LiveState;
  onDock: (docked: boolean) => void;
}) {
  const view = useMemo(
    () => buildView(data, now, undefined, BUILD_HOSTING),
    [data, now]
  );
  const lazy = useLazyHistory();
  const insights = useMemo(
    () => buildInsights(view, data, BUILD_ACTIVITY, now),
    [view, data, now]
  );
  // Hydration boundaries (nothing suspends; the server renders all of it):
  // below the hero, React hydrates section by section, yielding between
  // them and starting with the one a reader interacts with.
  const panels = {
    overview: (
      <>
        <TrackGlance t={t} view={view} />
        <ComingSoon t={t} lang={lang} />
        <Suspense>
          <UpdatesTeaser t={t} lang={lang} updates={insights.updates} />
        </Suspense>
      </>
    ),
    progress: (
      <>
        <OverallBar totals={view.totals} t={t} />
        <TracksSection t={t} lang={lang} view={view} onDock={onDock} />
        <Suspense>
          <TimelineSection
            t={t}
            lang={lang}
            view={view}
            live={data}
            now={now}
          />
        </Suspense>
      </>
    ),
    activity: (
      <>
        {BUILD_ACTIVITY.commits ? (
          <CommitTiles
            t={t}
            lang={lang}
            commits={BUILD_ACTIVITY.commits}
            today={view.today}
            now={now}
          />
        ) : (
          <ShippedTile t={t} lang={lang} insights={insights} />
        )}
        <Suspense>
          <PulseSection
            t={t}
            lang={lang}
            insights={insights}
            activity={BUILD_ACTIVITY}
            lazy={lazy}
            today={view.today}
            now={now}
          />
        </Suspense>
        <Suspense>
          <div
            className={`catchup${changelog?.releases.length ? '' : ' catchup-single'}`}
          >
            <ProductionUpdates t={t} lang={lang} updates={insights.updates} />
            <PatchNotes t={t} lang={lang} changelog={changelog} />
            {changelog?.releases.length ? null : <NotesEmpty t={t} />}
          </div>
        </Suspense>
      </>
    ),
    infrastructure: (
      <Suspense>
        <HostingSection
          t={t}
          lang={lang}
          view={view}
          main={data.main}
          hosting={BUILD_HOSTING}
        />
        <MigrationSection t={t} lang={lang} hosting={BUILD_HOSTING} />
      </Suspense>
    ),
  };
  return (
    <main className="page rm-page">
      <Hero
        t={t}
        view={view}
        lang={lang}
        insights={insights}
        generatedAt={data.generatedAt}
        shown={shownState(liveState, data.source)}
      />
      <RoadmapTabs
        label={t.tabs.label}
        labels={t.tabs}
        panels={panels}
        path={ROUTE_PATHS.roadmap[lang]}
      />
      <Footer t={t} liveCheckFailed={liveState === 'failed'} />
    </main>
  );
});
