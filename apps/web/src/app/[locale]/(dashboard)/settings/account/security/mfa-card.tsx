import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import { KeyRound } from '@tuturuuu/ui/icons';
import { getTranslations } from 'next-intl/server';

export default async function MFACard() {
  const t = await getTranslations('settings-account');

  return (
    <Card className="border-emerald-200 dark:border-emerald-800">
      <CardHeader className="bg-gradient-to-r from-emerald-50 to-green-50 dark:from-emerald-950/20 dark:to-green-950/20">
        <div className="flex items-center gap-3">
          <div className="rounded-full bg-emerald-100 p-2 dark:bg-emerald-900/30">
            <KeyRound className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <CardTitle className="text-xl">{t('mfa')}</CardTitle>
            <CardDescription>{t('mfa-description')}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-6">
        <div className="flex h-8 items-center justify-center">
          <p className="text-xl font-medium text-muted-foreground">
            Coming soon
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
