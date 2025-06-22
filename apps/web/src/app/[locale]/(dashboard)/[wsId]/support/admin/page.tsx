import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { ShieldUser } from '@tuturuuu/ui/icons';
import { getTranslations } from 'next-intl/server';

export default async function AdminSupportPage() {
  const t = await getTranslations();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <ShieldUser className="h-6 w-6" />
        <h1 className="text-2xl font-bold">
          {t('sidebar_tabs.all_inquiries')}
        </h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('support.all_inquiries')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="py-12 text-center text-muted-foreground">
            <ShieldUser className="mx-auto mb-4 h-12 w-12 opacity-50" />
            <p>{t('support.no_inquiries_yet')}</p>
            <p className="mt-2 text-sm">
              {t('support.inquiries_will_appear_here')}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
