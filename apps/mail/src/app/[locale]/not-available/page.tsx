import { MailX } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { getTranslations } from 'next-intl/server';
import { TTR_URL } from '@/constants/common';

export default async function NotAvailablePage() {
  const t = await getTranslations('mail');

  return (
    <main className="flex min-h-screen items-center justify-center bg-root-background p-6">
      <div className="w-full max-w-sm space-y-5 rounded-lg border border-dynamic bg-background p-6 text-center shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg border border-dynamic bg-foreground/5">
          <MailX className="h-5 w-5" />
        </div>
        <div className="space-y-2">
          <h1 className="font-semibold text-lg">{t('not_available_title')}</h1>
          <p className="text-muted-foreground text-sm">
            {t('not_available_description')}
          </p>
        </div>
        <Button asChild className="w-full">
          <a href={TTR_URL}>{t('back_to_platform')}</a>
        </Button>
      </div>
    </main>
  );
}
