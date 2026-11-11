import { createFileRoute } from '@tanstack/react-router';
import {
  createTranslator,
  MarketingShell,
  shellNavOffset,
} from '@tuturuuu/marketing-shell';
import { type CSSProperties, useMemo, useState } from 'react';
import en from '../../../messages/edufest-2026.en.json';
import vi from '../../../messages/edufest-2026.vi.json';
import ogImage from '../../assets/og-edufest-2026.png?no-inline';
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
import { initialLiveData } from '../../live/initial-data';
import { useLiveData } from '../../live/use-live-data';

export const Route = createFileRoute('/workshops/edufest-2026')({
  head: () => ({
    meta: [
      { title: en.meta.title },
      { name: 'description', content: en.meta.description },
      { property: 'og:title', content: en.meta.title },
      { property: 'og:description', content: en.meta.description },
      { property: 'og:url', content: WORKSHOP_URL },
      // Absolute: link previews fetch it without the page's base URL.
      { property: 'og:image', content: `https://tuturuuu.com${ogImage}` },
      { property: 'og:image:width', content: '1200' },
      { property: 'og:image:height', content: '630' },
      { property: 'og:image:alt', content: en.meta.title },
      { property: 'og:locale', content: 'en_GB' },
      { property: 'og:locale:alternate', content: 'vi_VN' },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:title', content: en.meta.title },
      { name: 'twitter:description', content: en.meta.description },
      { name: 'twitter:image', content: `https://tuturuuu.com${ogImage}` },
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

function EduFestWorkshopPage() {
  const [lang, setLang] = useState<Lang>('en');
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
