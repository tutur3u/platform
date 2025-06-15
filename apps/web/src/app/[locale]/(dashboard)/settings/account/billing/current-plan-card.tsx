import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import { Crown } from '@tuturuuu/ui/icons';
import { getTranslations } from 'next-intl/server';

// interface UsageStat {
//   labelKey: string;
//   current: number;
//   limit: number;
//   unit?: string;
// }

export default async function CurrentPlanCard() {
  const t = await getTranslations('settings-account');

  // const usageStats: UsageStat[] = [
  //   {
  //     labelKey: 'workspaces-usage',
  //     current: 2,
  //     limit: 3,
  //   },
  //   {
  //     labelKey: 'storage-usage',
  //     current: 1.2,
  //     limit: 5,
  //     unit: 'GB',
  //   },
  //   {
  //     labelKey: 'team-members-usage',
  //     current: 3,
  //     limit: 10,
  //   },
  // ];

  return (
    <Card className="overflow-hidden">
      <CardHeader className="bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-950/20 dark:to-yellow-950/20">
        <div className="flex items-center gap-3">
          <div className="rounded-full bg-amber-100 p-2 dark:bg-amber-900/30">
            <Crown className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <CardTitle className="text-lg">{t('current-plan')}</CardTitle>
            <CardDescription className="text-sm">
              {t('current-plan-description')}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6 p-6">
        {/* Plan Details */}
        <div className="space-y-3 text-center">
          <Badge
            variant="default"
            className="bg-gradient-to-r from-blue-600 to-purple-600 text-white"
          >
            {t('free-plan')}
          </Badge>
          <p className="text-3xl font-bold">$0</p>
          <p className="text-sm text-muted-foreground">{t('per-month')}</p>
        </div>

        {/* Usage Statistics */}
        {/* <div className="space-y-3">
          {usageStats.map((stat) => (
            <div
              key={stat.labelKey}
              className="flex items-center justify-between rounded-lg bg-muted/50 p-3"
            >
              <span className="text-sm text-muted-foreground">
                {t(stat.labelKey as any)}
              </span>
              <span className="font-medium">
                {stat.current}
                {stat.unit} / {stat.limit}
                {stat.unit}
              </span>
            </div>
          ))}
        </div> */}

        {/* Action Buttons */}
        <div className="space-y-3">
          <Button className="w-full" variant="default" disabled>
            {t('upgrade-plan')}
          </Button>
          <Button className="w-full" variant="outline" size="sm" disabled>
            {t('view-all-plans')}
          </Button>
        </div>

        {/* Upgrade Preview */}
        <div className="rounded-lg border bg-gradient-to-r from-purple-50 to-blue-50 p-4 dark:from-purple-950/20 dark:to-blue-950/20">
          <p className="mb-2 text-xs font-medium text-muted-foreground">
            Next tier: {t('pro-plan')}
          </p>
          <p className="text-lg font-bold">$6/{t('per-month')}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Unlimited meetings, advanced AI features
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
