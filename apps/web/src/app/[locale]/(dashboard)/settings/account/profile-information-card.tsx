import { UserIcon } from '@tuturuuu/icons';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import { Separator } from '@tuturuuu/ui/separator';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import UserAvatar from '../../../settings-avatar';
import DisplayNameInput from '../../../settings-display-name-input';
import FullNameInput from '../../../settings-full-name-input';
import AccountStatusSection from './account-status-section';

interface ProfileInformationCardProps {
  user: WorkspaceUser | null;
}

export default async function ProfileInformationCard({
  user,
}: ProfileInformationCardProps) {
  const t = await getTranslations('settings-account');

  return (
    <Card className="overflow-hidden">
      <CardHeader className="bg-linear-to-r from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20">
        <div className="flex items-center gap-3">
          <div className="rounded-full bg-blue-100 p-2 dark:bg-blue-900/30">
            <UserIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <CardTitle className="text-xl">
              {t('profile-information')}
            </CardTitle>
            <CardDescription>
              {t('profile-information-description')}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-8 p-6">
        {/* Avatar Section */}
        <div className="flex flex-col items-center space-y-4 sm:flex-row sm:space-x-6 sm:space-y-0">
          <div className="relative">{user && <UserAvatar user={user} />}</div>
          <div className="flex-1 text-center sm:text-left">
            <h3 className="font-semibold text-lg">
              {user?.display_name || user?.full_name || t('anonymous-user')}
            </h3>
            <p className="text-muted-foreground text-sm">
              {t('avatar-description')}
            </p>
          </div>
        </div>

        <AccountStatusSection user={user} />
        <Separator />

        {/* Name Fields */}
        <div className="grid gap-6 sm:grid-cols-2">
          <div className="space-y-3">
            <label className="font-medium text-sm">{t('display-name')}</label>
            <Suspense fallback={<Skeleton className="h-10 w-full" />}>
              <DisplayNameInput defaultValue={user?.display_name} />
            </Suspense>
            <p className="text-muted-foreground text-xs">
              {t('display-name-description')}
            </p>
          </div>

          <div className="space-y-3">
            <label className="font-medium text-sm">{t('full-name')}</label>
            <Suspense fallback={<Skeleton className="h-10 w-full" />}>
              <FullNameInput defaultValue={user?.full_name} />
            </Suspense>
            <p className="text-muted-foreground text-xs">
              {t('full-name-description')}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
