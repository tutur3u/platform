import { Monitor } from '@tuturuuu/icons';
import {
  Download,
  ExternalLink,
  ShieldCheck,
} from '@tuturuuu/icons/lucide-static';
import { getTranslations } from 'next-intl/server';
import { HeroAtmosphere } from '@/components/landing/shared/atmosphere';
import { getDesktopRelease } from '@/lib/desktop-downloads.server';
import { MobileDownloads } from './mobile-downloads';

export async function generateMetadata() {
  const t = await getTranslations('desktop_download');
  return { title: t('title'), description: t('description') };
}

export default async function DownloadPage() {
  const [t, release] = await Promise.all([
    getTranslations('desktop_download'),
    getDesktopRelease(),
  ]);

  return (
    <main className="relative isolate mx-auto w-full max-w-6xl px-4 py-16 sm:px-8 lg:py-24">
      <HeroAtmosphere />
      <div className="relative mx-auto max-w-2xl text-center">
        <span className="font-mono-ui text-dynamic-purple text-xs uppercase tracking-widest">
          {t('badge')}
        </span>
        <h1 className="mt-5 text-balance font-display font-semibold text-4xl tracking-tight sm:text-6xl">
          {t('title')}
        </h1>
        <p className="mt-5 text-pretty text-lg text-muted-foreground">
          {t('description')}
        </p>
        <a
          href="/login"
          className="mt-6 inline-flex items-center gap-2 rounded-full border bg-background/70 px-5 py-2.5 font-medium text-sm transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
        >
          {t('open_web')}
          <ExternalLink className="size-4" aria-hidden="true" />
        </a>
      </div>

      <p className="relative mx-auto mt-8 max-w-2xl rounded-2xl border border-dynamic-purple/20 bg-dynamic-purple/5 px-5 py-4 text-center text-sm">
        {t('beta_notice')}
      </p>
      <MobileDownloads />
      <h2 className="relative mt-14 font-semibold text-2xl tracking-tight">
        {t('desktop_title')}
      </h2>
      <div className="relative mt-5 grid gap-4 md:grid-cols-3">
        {(['windows', 'macos', 'linux'] as const).map((platform) => {
          const download = release?.downloads.find(
            (item) => item.platform === platform
          );
          return (
            <section
              key={platform}
              className="flex min-w-0 flex-col rounded-3xl border border-border/70 bg-background/80 p-6 shadow-sm backdrop-blur-sm"
            >
              <Monitor
                className="mb-6 size-7 text-dynamic-purple"
                aria-hidden="true"
              />
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="font-semibold text-xl">
                  {t(`${platform}.name`)}
                </h2>
                <span className="rounded-full bg-dynamic-purple/10 px-2.5 py-1 font-medium text-dynamic-purple text-xs">
                  {t(download ? 'beta' : 'coming_soon')}
                </span>
              </div>
              <p className="mt-2 text-muted-foreground text-sm">
                {t(`${platform}.requirements`)}
              </p>
              {download ? (
                <>
                  <a
                    href={download.url}
                    className="mt-6 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 font-medium text-primary-foreground text-sm transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
                  >
                    <Download className="size-4" aria-hidden="true" />
                    {t('download_for', { platform: t(`${platform}.name`) })}
                  </a>
                  <p className="mt-3 text-muted-foreground text-xs">
                    {t('package_size', {
                      size: Math.ceil(download.size / 1024 / 1024),
                    })}
                  </p>
                  <a
                    className="mt-2 inline-block rounded text-sm underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring"
                    href={download.releaseUrl}
                  >
                    {t('release_notes', {
                      version: download.tag.replace('desktop-v', ''),
                    })}
                  </a>
                  <details className="mt-4 text-muted-foreground text-xs">
                    <summary className="cursor-pointer rounded py-1 focus-visible:outline-2 focus-visible:outline-ring">
                      {t('checksum')}
                    </summary>
                    <code className="mt-2 block select-all break-all rounded-lg bg-muted p-3">
                      {download.sha256}
                    </code>
                  </details>
                </>
              ) : (
                <p className="mt-6 rounded-xl bg-muted px-4 py-3 text-muted-foreground text-sm">
                  {t('unavailable')}
                </p>
              )}
            </section>
          );
        })}
      </div>
      <div className="relative mx-auto mt-8 flex max-w-2xl items-start gap-3 text-muted-foreground text-sm">
        <ShieldCheck className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
        <div>
          <p>{t('security')}</p>
        </div>
      </div>
    </main>
  );
}
