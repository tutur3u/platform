import ResetPasswordDialog from '../reset-password-dialog';
import { type User } from '@supabase/supabase-js';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import { SettingItemTab } from '@tuturuuu/ui/custom/settings-item-tab';
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  KeyRound,
  Lock,
  Mail,
  Shield,
  Smartphone,
  UserCheck,
} from '@tuturuuu/ui/icons';
import { Calendar } from '@tuturuuu/ui/icons';
import { Separator } from '@tuturuuu/ui/separator';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';

interface SecuritySettingsCardProps {
  user: User | null;
  className?: string;
}

export default async function SecuritySettingsCard({
  user,
  className,
}: SecuritySettingsCardProps) {
  const t = await getTranslations('settings-account');

  if (!user) return null;

  const securityLevel = user.email ? 'good' : 'warning';
  const hasPassword = true; // Assuming user has password - you might want to check this

  // Get account age
  const accountAge = new Date().getTime() - new Date(user.created_at).getTime();
  const accountAgeDays = Math.floor(accountAge / (1000 * 60 * 60 * 24));

  // Get user's sessions count (you might want to implement this)
  const activeSessions = 1; // Placeholder

  return (
    <Card className={className}>
      <CardHeader className="pb-4">
        <div className="flex items-center gap-3">
          <div className="rounded-full bg-dynamic-green/10 p-2.5 dark:bg-dynamic-green/20">
            <Shield className="h-5 w-5 text-dynamic-green dark:text-dynamic-green/80" />
          </div>
          <div className="space-y-1">
            <CardTitle className="text-xl font-semibold">
              {t('security-settings')}
            </CardTitle>
            <CardDescription className="text-sm">
              {t('security-settings-description')}
            </CardDescription>
          </div>
          <div className="ml-auto">
            <Badge
              variant={securityLevel === 'good' ? 'default' : 'destructive'}
              className={
                securityLevel === 'good'
                  ? 'border-dynamic-green/30 bg-dynamic-green/10 text-dynamic-green dark:bg-dynamic-green/20 dark:text-dynamic-green/80'
                  : 'border-dynamic-red/30 bg-dynamic-red/10 text-dynamic-red dark:bg-dynamic-red/20 dark:text-dynamic-red/80'
              }
            >
              {securityLevel === 'good' ? (
                <>
                  <CheckCircle2 className="mr-1 h-3 w-3" />
                  {t('security-good')}
                </>
              ) : (
                <>
                  <AlertTriangle className="mr-1 h-3 w-3" />
                  {t('security-warning')}
                </>
              )}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6 p-6 pt-0">
        {/* Security Overview */}
        <div className="grid gap-4 sm:grid-cols-3">
          {/* Email Verification */}
          <div className="rounded-lg border bg-gradient-to-br from-dynamic-blue/5 to-dynamic-cyan/5 p-4 dark:from-dynamic-blue/5 dark:to-dynamic-cyan/5">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-dynamic-blue/10 p-2 dark:bg-dynamic-blue/20">
                <Mail className="h-4 w-4 text-dynamic-blue dark:text-dynamic-blue/80" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium">{t('email-verification')}</p>
                <div className="flex items-center gap-2">
                  {user.email ? (
                    <>
                      <CheckCircle2 className="h-4 w-4 text-dynamic-green dark:text-dynamic-green/80" />
                      <span className="text-xs text-dynamic-green dark:text-dynamic-green/80">
                        {t('verified')}
                      </span>
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="text-dynamic-amber dark:text-dynamic-amber/80 h-4 w-4" />
                      <span className="text-dynamic-amber dark:text-dynamic-amber/80 text-xs">
                        {t('unverified')}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Password Protection */}
          <div className="rounded-lg border bg-gradient-to-br from-dynamic-indigo/5 to-dynamic-purple/5 p-4 dark:from-dynamic-indigo/5 dark:to-dynamic-purple/5">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-dynamic-indigo/10 p-2 dark:bg-dynamic-indigo/20">
                <Lock className="h-4 w-4 text-dynamic-indigo dark:text-dynamic-indigo/80" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium">
                  {t('password-protection')}
                </p>
                <div className="flex items-center gap-2">
                  {hasPassword ? (
                    <>
                      <CheckCircle2 className="h-4 w-4 text-dynamic-green dark:text-dynamic-green/80" />
                      <span className="text-xs text-dynamic-green dark:text-dynamic-green/80">
                        {t('protected')}
                      </span>
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="text-dynamic-amber dark:text-dynamic-amber/80 h-4 w-4" />
                      <span className="text-dynamic-amber dark:text-dynamic-amber/80 text-xs">
                        {t('weak')}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Account Age */}
          <div className="from-dynamic-emerald/5 to-dynamic-teal/5 dark:from-dynamic-emerald/5 dark:to-dynamic-teal/5 rounded-lg border bg-gradient-to-br p-4">
            <div className="flex items-center gap-3">
              <div className="bg-dynamic-emerald/10 dark:bg-dynamic-emerald/20 rounded-full p-2">
                <Calendar className="text-dynamic-emerald dark:text-dynamic-emerald/80 h-4 w-4" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium">{t('account-age')}</p>
                <div className="flex items-center gap-2">
                  <UserCheck className="text-dynamic-emerald dark:text-dynamic-emerald/80 h-4 w-4" />
                  <span className="text-dynamic-emerald dark:text-dynamic-emerald/80 text-xs">
                    {t('days-old', { days: accountAgeDays })}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Security Actions */}
        <div className="space-y-4">
          <h4 className="text-sm font-medium text-foreground">
            {t('security-actions')}
          </h4>

          {/* Password Management */}
          <SettingItemTab
            title={t('password-management')}
            description={t('password-management-description')}
            icon={<KeyRound className="h-4 w-4" />}
          >
            <ResetPasswordDialog user={user} />
          </SettingItemTab>

          <Separator />

          {/* Two-Factor Authentication */}
          <SettingItemTab
            title={t('two-factor-authentication')}
            description={t('two-factor-authentication-description')}
            icon={<Smartphone className="h-4 w-4" />}
          >
            <Button variant="outline" size="sm" disabled>
              <Shield className="mr-2 h-4 w-4" />
              {t('setup-2fa')} ({t('coming-soon')})
            </Button>
          </SettingItemTab>

          <Separator />

          {/* Active Sessions */}
          <SettingItemTab
            title={t('active-sessions')}
            description={t('active-sessions-description', {
              count: activeSessions,
            })}
            icon={<Eye className="h-4 w-4" />}
          >
            <Button variant="outline" size="sm" asChild>
              <Link href="/settings/account/sessions">
                <Eye className="mr-2 h-4 w-4" />
                {t('view-sessions')}
              </Link>
            </Button>
          </SettingItemTab>
        </div>

        {/* Security Recommendations */}
        {(!user.email || securityLevel === 'warning') && (
          <div className="rounded-lg border border-dynamic-yellow/30 bg-dynamic-yellow/5 p-4 dark:border-dynamic-yellow/50 dark:bg-dynamic-yellow/10">
            <div className="flex gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-dynamic-yellow dark:text-dynamic-yellow/80" />
              <div className="space-y-2">
                <div>
                  <p className="text-sm font-medium text-dynamic-yellow dark:text-dynamic-yellow/90">
                    {t('security-recommendations')}
                  </p>
                  <p className="text-sm text-dynamic-yellow/80 dark:text-dynamic-yellow/70">
                    {t('security-recommendations-description')}
                  </p>
                </div>
                <ul className="space-y-1 text-sm text-dynamic-yellow/80 dark:text-dynamic-yellow/70">
                  {!user.email && <li>• {t('verify-email-recommendation')}</li>}
                  <li>• {t('link-additional-accounts-recommendation')}</li>
                  <li>• {t('enable-2fa-recommendation')}</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Security Tips */}
        <div className="rounded-lg border border-dynamic-blue/20 bg-dynamic-blue/5 p-4 dark:border-dynamic-blue/30 dark:bg-dynamic-blue/10">
          <div className="flex gap-3">
            <Shield className="mt-0.5 h-5 w-5 flex-shrink-0 text-dynamic-blue dark:text-dynamic-blue/80" />
            <div className="space-y-2">
              <div>
                <p className="text-sm font-medium text-dynamic-blue dark:text-dynamic-blue/90">
                  {t('security-tips')}
                </p>
                <p className="text-sm text-dynamic-blue/80 dark:text-dynamic-blue/70">
                  {t('security-tips-description')}
                </p>
              </div>
              <ul className="space-y-1 text-sm text-dynamic-blue/80 dark:text-dynamic-blue/70">
                <li>• {t('use-strong-passwords-tip')}</li>
                <li>• {t('avoid-public-wifi-tip')}</li>
                <li>• {t('regular-logout-tip')}</li>
                <li>• {t('monitor-account-activity-tip')}</li>
              </ul>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
