import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { Badge } from '@tuturuuu/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import { Mail } from '@tuturuuu/ui/icons';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import EmailInput from '../../../settings-email-input';

interface ContactInformationCardProps {
  user: WorkspaceUser | null;
}

export default async function ContactInformationCard({
  user,
}: ContactInformationCardProps) {
  const t = await getTranslations('settings-account');

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="rounded-full bg-green-100 p-2 dark:bg-green-900/30">
            <Mail className="h-5 w-5 text-green-600 dark:text-green-400" />
          </div>
          <div>
            <CardTitle>{t('contact-information')}</CardTitle>
            <CardDescription>
              {t('contact-information-description')}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3">
          <label htmlFor="email-input" className="text-sm font-medium">
            {t('email-address')}
          </label>
          <Suspense fallback={<Skeleton className="h-10 w-full" />}>
            <EmailInput
              id="email-input"
              oldEmail={user?.email}
              newEmail={user?.new_email}
            />
          </Suspense>
          <p className="text-xs text-muted-foreground">
            {t('email-description')}
          </p>
          {user?.new_email && (
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">
                {t('pending-verification')}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {t('check-email-verify', {
                  email: user.new_email,
                })}
              </span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
