import { Clock, Settings } from '@tuturuuu/icons';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { HeatmapSettingsForm } from './heatmap-settings-form';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('time-tracker.page_settings.metadata');

  return {
    title: t('title'),
    description: t('description'),
  };
}

export default async function TimeTrackerSettingsPage() {
  const t = await getTranslations('time-tracker.page_settings');

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-linear-to-br from-gray-500 to-gray-700 shadow-lg">
            <Settings className="h-5 w-5 text-white" />
          </div>
          <div>
            <CardTitle className="text-lg sm:text-xl">
              {t('timer_settings')}
            </CardTitle>
            <CardDescription>{t('customize_experience')}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {/* Activity Heatmap Settings */}
          <HeatmapSettingsForm />

          {/* Coming Soon Section */}
          <div className="rounded-lg border-2 border-muted-foreground/25 border-dashed p-4">
            <div className="mb-2 flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <h4 className="font-medium text-muted-foreground">
                {t('more_settings_coming_soon')}
              </h4>
            </div>
            <p className="text-muted-foreground text-xs">
              {t('more_settings_description')}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
