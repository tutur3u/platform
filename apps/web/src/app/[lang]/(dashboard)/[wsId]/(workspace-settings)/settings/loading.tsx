import useTranslation from 'next-translate/useTranslation';
import { Separator } from '@/components/ui/separator';

export default function Loading() {
  const { t } = useTranslation('ws-settings');
  const settingsLabel = t('common:settings');

  return (
    <>
      <div className="border-foreground/10 bg-foreground/5 rounded-lg border p-4">
        <h1 className="text-2xl font-bold">{settingsLabel}</h1>
        <p className="text-zinc-700 dark:text-zinc-400">{t('description')}</p>
      </div>
      <Separator className="my-4" />

      <div className="grid gap-4 opacity-50 lg:grid-cols-2">
        <div className="border-foreground/10 bg-foreground/5 flex h-64 flex-col rounded-lg border p-4" />
        <div className="border-foreground/10 bg-foreground/5 flex h-64 flex-col rounded-lg border p-4" />
        <div className="border-foreground/10 bg-foreground/5 flex h-64 flex-col rounded-lg border p-4" />
        <div className="border-foreground/10 bg-foreground/5 flex h-64 flex-col rounded-lg border p-4" />
      </div>
    </>
  );
}
