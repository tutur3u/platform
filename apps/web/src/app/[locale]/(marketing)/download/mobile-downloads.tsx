import { ExternalLink, Smartphone } from '@tuturuuu/icons/lucide-static';
import { getTranslations } from 'next-intl/server';

export async function MobileDownloads() {
  const t = await getTranslations('desktop_download');
  const platforms = [
    { id: 'ios', href: 'https://apps.apple.com/app/testflight/id899247664' },
    {
      id: 'android',
      href: 'https://play.google.com/apps/testing/com.tuturuuu.app.mobile',
    },
  ] as const;

  return (
    <section
      aria-labelledby="mobile-downloads-title"
      className="relative mt-14"
    >
      <h2
        id="mobile-downloads-title"
        className="font-semibold text-2xl tracking-tight"
      >
        {t('mobile.title')}
      </h2>
      <p className="mt-2 max-w-3xl text-muted-foreground text-sm">
        {t('mobile.invitation')}
      </p>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        {platforms.map(({ id, href }) => (
          <article
            key={id}
            className="rounded-3xl border border-border/70 bg-background/80 p-6"
          >
            <div className="flex items-center gap-3">
              <Smartphone
                className="size-6 text-dynamic-purple"
                aria-hidden="true"
              />
              <h3 className="font-semibold text-xl">
                {t(`mobile.${id}.name`)}
              </h3>
              <span className="rounded-full bg-dynamic-purple/10 px-2.5 py-1 font-medium text-dynamic-purple text-xs">
                {t('beta')}
              </span>
            </div>
            <p className="mt-3 text-muted-foreground text-sm">
              {t(`mobile.${id}.instructions`)}
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <a
                href={href}
                rel="noopener noreferrer"
                target="_blank"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 font-medium text-primary-foreground text-sm hover:opacity-90 focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
              >
                {t(`mobile.${id}.action`)}
                <ExternalLink className="size-4" aria-hidden="true" />
              </a>
              <a
                href="/contact"
                className="inline-flex min-h-11 items-center justify-center rounded-xl border px-4 font-medium text-sm hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
              >
                {t('mobile.request_invitation')}
              </a>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
