import { createFileRoute } from '@tanstack/react-router';
import { PublicSatelliteShell } from '@tuturuuu/satellite/public';
import { useMemo, useState } from 'react';
import en from '../../messages/en.json';
import vi from '../../messages/vi.json';
import { Footer, ThemeToggle } from '../components/chrome';
import { ComingSoon, Hero } from '../components/hero';
import { HostingSection, Method } from '../components/hosting';
import type { Lang } from '../components/shared';
import { ShippedSection } from '../components/shipped';
import { TracksSection } from '../components/tracks';
import generated from '../generated/live.json';
import { parseLiveData } from '../live/model';
import { useLiveData } from '../live/use-live-data';
import { buildView, type StatusFilter } from '../view-model';
import { MountedLogo } from '../components/chrome';

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

  return (
    <div
      className="roadmap"
      lang={lang}
      data-source-sha={__ROADMAP_BUILD_SHA__}
    >
      <a className="skip-link" href="#tracks">
        {t.skip}
      </a>
      <PublicSatelliteShell
        appName={t.appName}
        appHref="https://tuturuuu.com/roadmap/"
        homeHref="https://tuturuuu.com"
        navigationLabel={t.eyebrow}
        signIn={{ href: 'https://tuturuuu.com/login', label: t.signIn }}
        ImageComponent={MountedLogo}
        navigation={
          <>
            <fieldset className="segmented lang-switch">
              <legend className="sr-only">{t.language}</legend>
              {(['en', 'vi'] as const).map((code) => (
                <button
                  key={code}
                  type="button"
                  aria-pressed={lang === code}
                  onClick={() => setLang(code)}
                >
                  {code.toUpperCase()}
                </button>
              ))}
            </fieldset>
            <ThemeToggle label={t.theme} />
          </>
        }
        footer={<Footer t={t} data={live.data} />}
      >
        <main className="page">
          <Hero t={t} lang={lang} live={live} view={view} />
          <ComingSoon t={t} />
          <ShippedSection t={t} lang={lang} view={view} />
          <TracksSection
            t={t}
            lang={lang}
            view={view}
            filter={filter}
            setFilter={setFilter}
          />
          <HostingSection t={t} lang={lang} view={view} main={live.data.main} />
          <Method t={t} />
        </main>
      </PublicSatelliteShell>
    </div>
  );
}
