import { Loader2 } from '@tuturuuu/icons';
import { getTranslations } from 'next-intl/server';

export default async function Loading() {
  const t = await getTranslations('common');

  return (
    <div className="flex min-h-[400px] w-full items-center justify-center rounded-lg border border-dashed py-20">
      <div className="flex flex-col items-center gap-2">
        <Loader2 className="h-8 w-8 animate-spin text-dynamic-blue" />
        <p className="text-muted-foreground text-sm">{t('loading')}</p>
      </div>
    </div>
  );
}
