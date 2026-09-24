import { getTranslations } from 'next-intl/server';
export default async function AccessDenied() {
  const t = await getTranslations('parley');
  return (
    <main className="mx-auto max-w-lg space-y-5 px-6 py-24">
      <p className="font-mono text-sm">PARLEY</p>
      <h1 className="font-semibold text-3xl">{t('access_title')}</h1>
      <p className="text-muted-foreground">{t('access_body')}</p>
      <a className="underline" href="https://tuturuuu.com">
        {t('account')}
      </a>
    </main>
  );
}
