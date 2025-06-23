import { Card, CardContent } from '@tuturuuu/ui/card';
import { useTranslations } from 'next-intl';

export default function Guider() {
  const t = useTranslations('nova.leaderboard-page');

  return (
    <Card className="bg-white dark:border-slate-800 dark:bg-slate-900/80">
      <CardContent className="p-6">
        <h3 className="mb-3 text-lg font-bold text-gray-900 dark:text-slate-200">
          {t('tutorials.title')}
        </h3>
        <ul className="space-y-3 text-sm text-muted-foreground dark:text-slate-400">
          <li className="flex items-start gap-2">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400">
              1
            </span>
            <span>{t('tutorials.step-1')}</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400">
              2
            </span>
            <span>{t('tutorials.step-2')}</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400">
              3
            </span>
            <span>{t('tutorials.step-3')}</span>
          </li>
        </ul>
      </CardContent>
    </Card>
  );
}
