import { useNavigate } from '@tanstack/react-router';
import {
  createTranslator,
  MarketingShell,
  shellNavOffset,
} from '@tuturuuu/marketing-shell';
import { type CSSProperties, Suspense, useCallback, useMemo } from 'react';
import en from '../../messages/edufest-2026.en.json';
import vi from '../../messages/edufest-2026.vi.json';
import logo from '../assets/tuturuuu-logo.png?no-inline';
import type { Lang } from '../components/shared';
import {
  useWorkshopStatuses,
  WsAgenda,
  WsAgentTeam,
  WsBoothHall,
  WsCapabilities,
  WsDemos,
  WsFaq,
  WsHero,
  WsLearn,
  WsLiveClass,
  WsTools,
  WsVenue,
} from '../components/workshop';
import { initialLiveData } from '../live/initial-data';
import { useLiveData } from '../live/use-live-data';
import { pagePath, ROUTE_PATHS } from '../seo';

export function EduFestWorkshopPage({ lang }: { lang: Lang }) {
  const navigate = useNavigate();
  const setLang = useCallback(
    (next: Lang) => {
      if (next !== lang)
        void navigate({ to: ROUTE_PATHS.edufest[next], resetScroll: false });
    },
    [lang, navigate]
  );
  const t = lang === 'en' ? en : vi;
  const initialData = initialLiveData();
  const live = useLiveData(initialData);
  const statuses = useWorkshopStatuses(live.data);
  const shellT = useMemo(() => createTranslator(lang), [lang]);

  return (
    <div
      className="roadmap workshop"
      lang={lang}
      data-source-sha={__ROADMAP_BUILD_SHA__}
      data-nav-compact=""
      style={
        {
          '--shell-nav-offset': `${shellNavOffset(true)}px`,
        } as CSSProperties
      }
    >
      <a className="skip-link" href="#ws-title">
        {t.skip}
      </a>
      <MarketingShell
        locale={lang}
        logoSrc={logo}
        onLocaleChange={setLang}
        navCompact
        pathname={pagePath('edufest', lang)}
        signInHref="https://tuturuuu.com/login"
        t={shellT}
      >
        <main className="page ws-page">
          <WsHero t={t} />
          {/* One hydration boundary per section below the hero (nothing
              suspends; the server renders every section): React hydrates
              them one by one, starting with the one a reader taps. */}
          <Suspense>
            <WsLearn t={t} />
          </Suspense>
          <Suspense>
            <WsLiveClass t={t} statuses={statuses} />
          </Suspense>
          <Suspense>
            <WsAgenda t={t} />
          </Suspense>
          <Suspense>
            <WsDemos t={t} statuses={statuses} />
          </Suspense>
          <Suspense>
            <WsAgentTeam t={t} />
          </Suspense>
          <Suspense>
            <WsBoothHall t={t} />
          </Suspense>
          <Suspense>
            <WsTools t={t} logo={logo} />
          </Suspense>
          <Suspense>
            <WsVenue t={t} />
          </Suspense>
          <Suspense>
            <WsCapabilities t={t} statuses={statuses} />
          </Suspense>
          <Suspense>
            <WsFaq t={t} />
          </Suspense>
        </main>
      </MarketingShell>
    </div>
  );
}
