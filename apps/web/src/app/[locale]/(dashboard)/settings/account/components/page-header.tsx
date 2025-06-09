import { getTranslations } from 'next-intl/server';

export default async function PageHeader() {
  const t = await getTranslations('settings-account');

  return (
    <div className="space-y-2">
      <h1 className="text-3xl font-bold tracking-tight">{t('account')}</h1>
      <p className="text-muted-foreground">{t('page-description')}</p>
    </div>
  );
}
