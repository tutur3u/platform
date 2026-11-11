import { createFileRoute } from '@tanstack/react-router';
import {
  createTranslator,
  MarketingShell,
  shellNavOffset,
} from '@tuturuuu/marketing-shell';
import { type CSSProperties, useMemo, useState } from 'react';
import en from '../../../messages/edufest-2026.en.json';
import vi from '../../../messages/edufest-2026.vi.json';
import logo from '../../assets/tuturuuu-logo.png?no-inline';
import type { Lang } from '../../components/shared';
import {
  useWorkshopStatuses,
  WsAgenda,
  WsAiDemo,
  WsCapabilities,
  WsFlow,
  WsHero,
  WsJourney,
  WsTools,
} from '../../components/workshop';
import {
  WORKSHOP_PATH,
  WORKSHOP_URL,
} from '../../content/workshops/edufest-2026';
import generated from '../../generated/live.json';
import { parseLiveData } from '../../live/model';
import { useLiveData } from '../../live/use-live-data';

export const Route = createFileRoute('/workshops/edufest-2026')({
  head: () => ({
    meta: [
      { title: en.meta.title },
      { name: 'description', content: en.meta.description },
      { property: 'og:title', content: en.meta.title },
      { property: 'og:description', content: en.meta.description },
      { property: 'og:url', content: WORKSHOP_URL },
    ],
    links: [
      { rel: 'canonical', href: WORKSHOP_URL },
      // One URL serves both languages (the EN/VI switch is client-side).
      { rel: 'alternate', hrefLang: 'en', href: WORKSHOP_URL },
      { rel: 'alternate', hrefLang: 'vi', href: WORKSHOP_URL },
      { rel: 'alternate', hrefLang: 'x-default', href: WORKSHOP_URL },
    ],
  }),
  component: EduFestWorkshopPage,
});

const initialData = parseLiveData(generated);

function EduFestWorkshopPage() {
  const [lang, setLang] = useState<Lang>('en');
  const t = lang === 'en' ? en : vi;
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
        pathname={WORKSHOP_PATH}
        signInHref="https://tuturuuu.com/login"
        t={shellT}
      >
        <main className="page ws-page">
          <WsHero t={t} />
          <WsAgenda t={t} />
          <WsJourney t={t} statuses={statuses} />
          <WsAiDemo t={t} statuses={statuses} />
          <WsFlow t={t} statuses={statuses} />
          <WsCapabilities t={t} statuses={statuses} />
          <WsTools t={t} logo={logo} />
        </main>
      </MarketingShell>
    </div>
  );
}
