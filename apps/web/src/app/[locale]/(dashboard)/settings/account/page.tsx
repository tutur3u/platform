import UserAvatar from '../../../settings-avatar';
import DisplayNameInput from '../../../settings-display-name-input';
import EmailInput from '../../../settings-email-input';
import FullNameInput from '../../../settings-full-name-input';
import DefaultWorkspaceSetting from './default-workspace-setting';
import ResetPasswordForm from './reset-password-form';
import { Badge } from '@tuturuuu/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import { Building, Mail, Settings, Shield, User } from '@tuturuuu/ui/icons';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { getCurrentUser } from '@tuturuuu/utils/user-helper';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';

export default async function AccountSettingsPage() {
  const t = await getTranslations();
  const user = await getCurrentUser();

  return (
    <div className="container mx-auto space-y-8 p-6">
      {/* Page Header */}
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">
          {t('settings-account.account')}
        </h1>
        <p className="text-muted-foreground">
          {t('settings-account.page-description')}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Profile Section */}
        <div className="space-y-6 lg:col-span-2">
          {/* Profile Information Card */}
          <Card className="overflow-hidden">
            <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-blue-100 p-2 dark:bg-blue-900/30">
                  <User className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <CardTitle className="text-xl">
                    {t('settings-account.profile-information')}
                  </CardTitle>
                  <CardDescription>
                    {t('settings-account.profile-information-description')}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6 p-6">
              {/* Avatar Section */}
              <div className="flex flex-col items-center space-y-4 sm:flex-row sm:space-y-0 sm:space-x-6">
                <div className="relative">
                  {user && <UserAvatar user={user} />}
                </div>
                <div className="flex-1 text-center sm:text-left">
                  <h3 className="text-lg font-semibold">
                    {user?.display_name ||
                      user?.full_name ||
                      t('settings-account.anonymous-user')}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {t('settings-account.avatar-description')}
                  </p>
                </div>
              </div>

              {/* Name Fields */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    {t('settings-account.display-name')}
                  </label>
                  <Suspense fallback={<Skeleton className="h-10 w-full" />}>
                    <DisplayNameInput defaultValue={user?.display_name} />
                  </Suspense>
                  <p className="text-xs text-muted-foreground">
                    {t('settings-account.display-name-description')}
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    {t('settings-account.full-name')}
                  </label>
                  <Suspense fallback={<Skeleton className="h-10 w-full" />}>
                    <FullNameInput defaultValue={user?.full_name} />
                  </Suspense>
                  <p className="text-xs text-muted-foreground">
                    {t('settings-account.full-name-description')}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Contact Information Card */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-green-100 p-2 dark:bg-green-900/30">
                  <Mail className="h-5 w-5 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <CardTitle>
                    {t('settings-account.contact-information')}
                  </CardTitle>
                  <CardDescription>
                    {t('settings-account.contact-information-description')}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  {t('settings-account.email-address')}
                </label>
                <Suspense fallback={<Skeleton className="h-10 w-full" />}>
                  <EmailInput
                    oldEmail={user?.email}
                    newEmail={user?.new_email}
                  />
                </Suspense>
                <p className="text-xs text-muted-foreground">
                  {t('settings-account.email-description')}
                </p>
                {user?.new_email && (
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      {t('settings-account.pending-verification')}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {t('settings-account.check-email-verify', {
                        email: user.new_email,
                      })}
                    </span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Workspace Settings Card */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-purple-100 p-2 dark:bg-purple-900/30">
                  <Building className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <CardTitle className="text-lg">
                    {t('settings-account.workspace')}
                  </CardTitle>
                  <CardDescription className="text-sm">
                    {t('settings-account.workspace-settings-description')}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  {t('settings-account.default-workspace')}
                </label>
                <Suspense fallback={<Skeleton className="h-10 w-full" />}>
                  <DefaultWorkspaceSetting
                    defaultWorkspaceId={user?.default_workspace_id}
                  />
                </Suspense>
                <p className="text-xs text-muted-foreground">
                  {t('settings-account.default-workspace-description')}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Account Status Card */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-emerald-100 p-2 dark:bg-emerald-900/30">
                  <Settings className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <CardTitle className="text-lg">
                    {t('settings-account.account-status')}
                  </CardTitle>
                  <CardDescription className="text-sm">
                    {t('settings-account.account-status-description')}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  {t('settings-account.status')}
                </span>
                <Badge
                  variant="default"
                  className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                >
                  {t('settings-account.active')}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  {t('settings-account.email-verified')}
                </span>
                <Badge>{t('settings-account.verified')}</Badge>
              </div>
              {user?.created_at && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    {t('settings-account.member-since')}
                  </span>
                  <span className="text-sm font-medium">
                    {new Date(user.created_at).toLocaleDateString()}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Security Section */}
      {user && (
        <Card className="border-orange-200 dark:border-orange-800">
          <CardHeader className="bg-gradient-to-r from-orange-50 to-red-50 dark:from-orange-950/20 dark:to-red-950/20">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-orange-100 p-2 dark:bg-orange-900/30">
                <Shield className="h-5 w-5 text-orange-600 dark:text-orange-400" />
              </div>
              <div>
                <CardTitle className="text-xl">
                  {t('settings-account.security-settings')}
                </CardTitle>
                <CardDescription>
                  {t('settings-account.security-settings-description')}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-6">
            <ResetPasswordForm user={user} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
