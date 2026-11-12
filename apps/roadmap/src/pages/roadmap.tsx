import { useNavigate } from '@tanstack/react-router';
import {
  createTranslator,
  MarketingShell,
  shellNavOffset,
} from '@tuturuuu/marketing-shell';
import {
  type CSSProperties,
  memo,
  useCallback,
  useMemo,
  useState,
} from 'react';
import en from '../../messages/en.json';
import vi from '../../messages/vi.json';
import logo from '../assets/tuturuuu-logo.png?no-inline';
import { Footer } from '../components/chrome';
import { ComingSoon, Hero } from '../components/hero';
import { HostingSection, Method } from '../components/hosting';
import { TrackGlance } from '../components/pulse';
import type { Lang } from '../components/shared';
import { TimelineSection } from '../components/timeline';
import { TracksSection } from '../components/tracks';
import { initialLiveData } from '../live/initial-data';
import type { LiveData } from '../live/model';
import { useLiveData } from '../live/use-live-data';
import { pagePath, ROUTE_PATHS } from '../seo';
import { buildView } from '../view-model';

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
        <RoadmapMain
          t={t}
          lang={lang}
          data={live.data}
          now={live.now}
          liveCheckFailed={live.state === 'failed'}
          hostsCheckedAt={initialData.generatedAt}
          onDock={onDock}
        />
      </MarketingShell>
    </div>
  );
}

/**
 * Every section, memoised: docking the navbar (a scroll-driven state change
 * on the page) re-renders only the shell, never the 8,000-node track list.
 */
const RoadmapMain = memo(function RoadmapMain({
  t,
  lang,
  data,
  now,
  liveCheckFailed,
  hostsCheckedAt,
  onDock,
}: {
  t: typeof en;
  lang: Lang;
  data: LiveData;
  now: number;
  liveCheckFailed: boolean;
  hostsCheckedAt: string;
  onDock: (docked: boolean) => void;
}) {
  const view = useMemo(() => buildView(data, now), [data, now]);
  return (
    <main className="page">
      <Hero t={t} view={view} lang={lang} data={data} now={now} />
      <TrackGlance t={t} view={view} />
      <ComingSoon t={t} />
      <TimelineSection t={t} lang={lang} view={view} live={data} now={now} />
      <TracksSection t={t} lang={lang} view={view} onDock={onDock} />
      <HostingSection
        t={t}
        lang={lang}
        view={view}
        main={data.main}
        hostsCheckedAt={hostsCheckedAt}
      />
      <Method t={t} />
      <Footer t={t} lang={lang} data={data} liveCheckFailed={liveCheckFailed} />
    </main>
  );
});
