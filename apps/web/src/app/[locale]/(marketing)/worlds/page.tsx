import { getLocale, getTranslations } from 'next-intl/server';

export default async function WorldsPage() {
  const [locale, t] = await Promise.all([
    getLocale(),
    getTranslations('worlds'),
  ]);

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-6 py-16">
      <h1 className="font-semibold text-4xl">Tuturuuu Worlds</h1>
      <p className="text-muted-foreground">{t('description')}</p>
      <a
        className="inline-flex rounded-md bg-primary px-4 py-2 text-primary-foreground"
        href={`https://worlds.tuturuuu.com/?lang=${locale}`}
      >
        {t('preview')}
      </a>
    </main>
  );
}
