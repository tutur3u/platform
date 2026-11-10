import { createFileRoute } from '@tanstack/react-router';
import { createTranslator, MarketingShell } from '@tuturuuu/marketing-shell';
import { useMemo, useState } from 'react';
import en from '../../messages/en.json';
import vi from '../../messages/vi.json';
import { Footer } from '../components/chrome';
import logo from '../assets/tuturuuu-logo.png?no-inline';
import { ComingSoon, Hero } from '../components/hero';
import { HostingSection, Method } from '../components/hosting';
import type { Lang } from '../components/shared';
import { TimelineSection } from '../components/timeline';
import { TracksSection } from '../components/tracks';
import generated from '../generated/live.json';
import { parseLiveData } from '../live/model';
import { useLiveData } from '../live/use-live-data';
import { buildView, type StatusFilter } from '../view-model';

export const Route = createFileRoute('/')({ component: RoadmapPage });

const initialData = parseLiveData(generated);

function RoadmapPage() {
  const [lang, setLang] = useState<Lang>('en');
  const [filter, setFilter] = useState<StatusFilter>('all');
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
    >
      <a className="skip-link" href="#tracks">
        {t.skip}
      </a>
      <MarketingShell
        locale={lang}
        logoSrc={logo}
        onLocaleChange={setLang}
        pathname="/roadmap"
        signInHref="https://tuturuuu.com/login"
        t={shellT}
      >
        <main className="page">
          <Hero t={t} lang={lang} live={live} view={view} />
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
          />
          <HostingSection
            t={t}
            lang={lang}
            view={view}
            main={live.data.main}
            hostsCheckedAt={initialData.generatedAt}
          />
          <Method t={t} />
          <Footer t={t} data={live.data} />
        </main>
      </MarketingShell>
    </div>
  );
}
