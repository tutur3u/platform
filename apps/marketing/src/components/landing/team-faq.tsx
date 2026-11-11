import { getLocale, getTranslations } from 'next-intl/server';
import { getPublicLocalizedPath } from '@/lib/seo/public-routes';

const FAQ_KEYS = ['workspace', 'start', 'openSource', 'ai'] as const;

/** Useful answers and product links available before hydration or scrolling. */
export async function TeamFaq() {
  const t = await getTranslations('landing.teamFaq');
  const nav = await getTranslations('products');
  const locale = (await getLocale()) === 'vi' ? 'vi' : 'en';

  return (
    <section
      className="px-4 py-20 sm:px-6 lg:px-8"
      aria-labelledby="team-faq-title"
    >
      <div className="mx-auto max-w-4xl">
        <h2
          id="team-faq-title"
          className="text-balance font-display font-semibold text-3xl tracking-tight sm:text-4xl"
        >
          {t('title')}
        </h2>
        <div className="mt-8 divide-y divide-border border-border border-y">
          {FAQ_KEYS.map((key) => (
            <details
              key={key}
              className="group py-5"
              open={key === 'workspace'}
            >
              <summary className="cursor-pointer rounded font-medium focus-visible:outline-2 focus-visible:outline-ring">
                {t(`items.${key}.question`)}
              </summary>
              <p className="mt-3 max-w-3xl text-muted-foreground leading-relaxed">
                {t(`items.${key}.answer`)}
              </p>
            </details>
          ))}
        </div>
        <div className="mt-6 flex flex-wrap gap-x-6 gap-y-3">
          {(['tasks', 'calendar', 'documents', 'ai'] as const).map((slug) => (
            <a
              key={slug}
              href={getPublicLocalizedPath(`/products/${slug}`, locale)}
              className="rounded text-sm underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring"
            >
              {nav(`${slug}.seo.title`)}
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
