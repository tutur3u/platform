import { CalendarIcon } from '@tuturuuu/icons';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import FirstDayOfWeekInput from '../../../settings-first-day-of-week-input';

interface PreferencesCardProps {
  user: WorkspaceUser | null;
}

export default async function PreferencesCard({ user }: PreferencesCardProps) {
  const t = await getTranslations('settings-account');

  return (
    <Card className="overflow-hidden">
      <CardHeader className="bg-gradient-to-r from-dynamic-purple/10 to-dynamic-blue/10">
        <div className="flex items-center gap-3">
          <div className="rounded-full bg-dynamic-purple/10 p-2">
            <CalendarIcon className="h-5 w-5 text-dynamic-purple" />
          </div>
          <div>
            <CardTitle className="text-xl">{t('preferences')}</CardTitle>
            <CardDescription>{t('preferences-description')}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6 p-6">
        {/* First Day of Week */}
        <div className="space-y-3">
          <label className="font-medium text-sm">
            {t('first-day-of-week')}
          </label>
          <Suspense fallback={<Skeleton className="h-10 w-full" />}>
            <FirstDayOfWeekInput defaultValue={user?.first_day_of_week} />
          </Suspense>
          <p className="text-muted-foreground text-xs">
            {t('first-day-of-week-description')}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
