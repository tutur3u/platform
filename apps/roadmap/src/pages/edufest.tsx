import { useNavigate } from '@tanstack/react-router';
import {
  createTranslator,
  MarketingShell,
  shellNavOffset,
} from '@tuturuuu/marketing-shell';
import { type CSSProperties, useCallback, useMemo } from 'react';
import en from '../../messages/edufest-2026.en.json';
import vi from '../../messages/edufest-2026.vi.json';
import logo from '../assets/tuturuuu-logo.png?no-inline';
import type { Lang } from '../components/shared';
import {
  useWorkshopStatuses,
  WsAgenda,
  WsCapabilities,
  WsExperience,
  WsFaq,
  WsFlow,
  WsHero,
  WsHighlights,
  WsInsightsDemo,
  WsSimulator,
  WsReadiness,
  WsSeatSwap,
  WsTools,
} from '../components/workshop';
import { WORKSHOP_EVENT } from '../content/workshops/edufest-2026';
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
          <WsHighlights t={t} />
          <WsSeatSwap t={t} />
          <WsAgenda t={t} />
          <WsExperience t={t} />
          <WsSimulator t={t} statuses={statuses} />
          <WsFlow t={t} statuses={statuses} />
          <WsInsightsDemo t={t} statuses={statuses} />
          <WsReadiness
            t={t}
            statuses={statuses}
            checkedAt={live.data.generatedAt}
            lang={lang}
          />
          <WsCapabilities t={t} statuses={statuses} />
          <WsFaq t={t} />
          <WsTools t={t} logo={logo} />
        </main>
      </MarketingShell>
    </div>
  );
}
