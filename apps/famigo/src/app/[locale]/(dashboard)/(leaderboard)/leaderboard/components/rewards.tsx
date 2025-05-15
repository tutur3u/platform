import { Card, CardContent } from '@tuturuuu/ui/card';
import { Award, Clock, Medal, Target, Trophy } from '@tuturuuu/ui/icons';
import { useTranslations } from 'next-intl';

export default function Rewards() {
  const t = useTranslations('nova.leaderboard-page');

  return (
    <Card className="border-gray-200 bg-white dark:border-slate-800 dark:bg-slate-900/80">
      <div className="absolute inset-x-0 top-0 h-1 bg-linear-to-r from-yellow-400 to-yellow-600" />
      <CardContent className="p-6">
        <h3 className="mb-3 text-lg font-bold text-gray-900 dark:text-slate-200">
          {t('rewards.current-rewards')}
        </h3>
        <ul className="space-y-3">
          <li className="flex items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-yellow-100 dark:bg-yellow-900/30">
              <Trophy className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
            </div>
            <div>
              <p className="font-medium text-gray-900 dark:text-slate-200">
                {t('rewards.1st-place')}
              </p>
              <p className="text-sm text-gray-500 dark:text-slate-400">
                {t('rewards.1st-place-reward')}
              </p>
            </div>
          </li>
          <li className="flex items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
              <Medal className="h-4 w-4 text-gray-600 dark:text-gray-400" />
            </div>
            <div>
              <p className="font-medium text-gray-900 dark:text-slate-200">
                {t('rewards.2nd-place')}
              </p>
              <p className="text-sm text-gray-500 dark:text-slate-400">
                {t('rewards.2nd-place-reward')}
              </p>
            </div>
          </li>
          <li className="flex items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
              <Medal className="h-4 w-4 text-amber-700 dark:text-amber-500" />
            </div>
            <div>
              <p className="font-medium text-gray-900 dark:text-slate-200">
                {t('rewards.3rd-place')}
              </p>
              <p className="text-sm text-gray-500 dark:text-slate-400">
                {t('rewards.3rd-place-reward')}
              </p>
            </div>
          </li>
          <li className="flex items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-purple-100 dark:bg-purple-900/30">
              <Award className="h-4 w-4 text-purple-700 dark:text-purple-400" />
            </div>
            <div>
              <p className="font-medium text-gray-900 dark:text-slate-200">
                {t('rewards.top-5')}
              </p>
              <p className="text-sm text-gray-500 dark:text-slate-400">
                {t('rewards.top-5-reward')}
              </p>
            </div>
          </li>
          <li className="flex items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-pink-100 dark:bg-pink-900/30">
              <Target className="h-4 w-4 text-pink-700 dark:text-pink-400" />
            </div>
            <div>
              <p className="font-medium text-gray-900 dark:text-slate-200">
                {t('rewards.top-16')}
              </p>
              <p className="text-sm text-gray-500 dark:text-slate-400">
                {t('rewards.top-16-reward')}
              </p>
            </div>
          </li>
          <li className="flex items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/30">
              <Clock className="h-4 w-4 text-blue-700 dark:text-blue-400" />
            </div>
            <div>
              <p className="font-medium text-gray-900 dark:text-slate-200">
                {t('rewards.first-45-teams')}
              </p>
              <p className="text-sm text-gray-500 dark:text-slate-400">
                {t('rewards.first-45-teams-reward')}
              </p>
            </div>
          </li>
        </ul>
      </CardContent>
    </Card>
  );
}
