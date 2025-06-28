'use client';

import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Button } from '@tuturuuu/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { Globe, Settings, User } from '@tuturuuu/ui/icons';
import { getInitials } from '@tuturuuu/utils/name-helper';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { LanguageWrapper } from '../../(dashboard)/_components/language-wrapper';
import { SystemLanguageWrapper } from '../../(dashboard)/_components/system-language-wrapper';
import { ThemeDropdownToggle } from '../../(dashboard)/_components/theme-dropdown-toggle';

interface OnboardingSettingsProps {
  user: WorkspaceUser | null;
  currentLocale: string | undefined;
}

export function OnboardingSettings({
  user,
  currentLocale,
}: OnboardingSettingsProps) {
  const router = useRouter();
  const t = useTranslations();

  const logout = async () => {
    await fetch('/api/auth/logout', {
      method: 'POST',
    });
    router.refresh();
  };

  return (
    <div className="w-full space-y-6">
      {/* User Account Information */}
      {user && (
        <Card className="w-full">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <User className="h-5 w-5" />
              {t('onboarding.account-info')}
            </CardTitle>
            <CardDescription>
              {t('onboarding.account-info-desc')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-start gap-4">
              <Avatar className="h-12 w-12">
                <AvatarImage
                  src={user.avatar_url || ''}
                  alt={user.display_name || user.email || 'User'}
                />
                <AvatarFallback className="text-lg font-semibold">
                  {user.display_name ? (
                    getInitials(user.display_name)
                  ) : (
                    <User className="h-6 w-6" />
                  )}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 space-y-1">
                <div className="text-lg font-semibold">
                  {user.display_name || user.full_name || t('common.unnamed')}
                </div>
                <div className="text-sm text-foreground/70">{user.email}</div>
                {user.created_at && (
                  <div className="text-xs text-foreground/50">
                    {t('common.member-since', {
                      date: new Date(user.created_at).toLocaleDateString(),
                    })}
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Settings Controls */}
      <Card className="w-full">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Settings className="h-5 w-5" />
            {t('onboarding.preferences')}
          </CardTitle>
          <CardDescription>{t('onboarding.preferences-desc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4">
            {/* Theme Toggle */}
            <div className="grid gap-2">
              <label className="text-sm font-medium">{t('common.theme')}</label>
              <div className="flex items-center justify-between rounded-lg border border-foreground/20 bg-dynamic-red/5 p-3">
                <span className="text-sm text-foreground/80">
                  {t('onboarding.change-theme')}
                </span>
                <ThemeDropdownToggle />
              </div>
            </div>

            {/* Language Selector */}
            <div className="grid gap-2">
              <label className="text-sm font-medium">
                {t('common.language')}
              </label>
              <div className="flex items-center justify-between rounded-lg border border-foreground/20 bg-dynamic-blue/5 p-3">
                <span className="text-sm text-foreground/80">
                  {t('onboarding.change-language')}
                </span>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm">
                      <Globe className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuLabel>
                      {t('common.select-language')}
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuGroup>
                      <SystemLanguageWrapper currentLocale={currentLocale} />
                      <LanguageWrapper
                        label="English"
                        locale="en"
                        currentLocale={currentLocale}
                      />
                      <LanguageWrapper
                        label="Tiếng Việt"
                        locale="vi"
                        currentLocale={currentLocale}
                      />
                    </DropdownMenuGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </div>

          {/* Logout Button */}
          <div className="mt-4 border-t border-foreground/10 pt-4">
            <div className="flex items-center justify-between rounded-lg border border-dynamic-red/30 bg-dynamic-red/5 p-3">
              <div>
                <div className="text-sm font-medium text-foreground">
                  {t('onboarding.sign-out')}
                </div>
                <div className="text-xs text-foreground/60">
                  {t('onboarding.sign-out-desc')}
                </div>
              </div>
              <Button onClick={logout} variant="destructive" size="sm">
                {t('common.logout')}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
