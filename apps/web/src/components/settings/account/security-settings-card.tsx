'use client';

import { AlertTriangle, CheckCircle2, Eye } from '@tuturuuu/icons';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { SettingItemTab } from '@tuturuuu/ui/custom/settings-item-tab';
import { SettingsSection } from '@tuturuuu/ui/custom/settings-section';
import { cn } from '@tuturuuu/utils/format';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import MFAMethodList from './mfa-method-list';
import PasskeysSettings from './passkeys-settings';
import ResetPasswordDialog from './reset-password-dialog';

interface SecuritySettingsCardProps {
  user: WorkspaceUser | null;
  className?: string;
  onOpenSessions?: () => void;
  /** Rendered between the two-factor and session sections. */
  children?: ReactNode;
}

function StatusValue({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <span className="flex items-center gap-1.5 text-sm">
      {ok ? (
        <CheckCircle2 className="size-4 text-dynamic-green" />
      ) : (
        <AlertTriangle className="size-4 text-dynamic-yellow" />
      )}
      {children}
    </span>
  );
}

export default function SecuritySettingsCard({
  user,
  className,
  onOpenSessions,
  children,
}: SecuritySettingsCardProps) {
  const t = useTranslations('settings-account');
  const tCommon = useTranslations('common');

  if (!user) return null;

  const securityLevel = user.email ? 'good' : 'warning';
  const hasPassword = true; // Assuming user has password - you might want to check this

  // Get account age
  const accountAge = user?.created_at
    ? Date.now() - new Date(user.created_at).getTime()
    : 0; // Handle undefined created_at
  const accountAgeDays = Math.floor(accountAge / (1000 * 60 * 60 * 24));

  // Get user's sessions count (you might want to implement this)
  const activeSessions = 1; // Placeholder

  return (
    <div className={cn('space-y-8', className)}>
      <SettingsSection
        title={t('account-status')}
        action={
          <Badge
            variant="outline"
            className={
              securityLevel === 'good'
                ? 'border-dynamic-green/30 bg-dynamic-green/10 text-dynamic-green'
                : 'border-dynamic-red/30 bg-dynamic-red/10 text-dynamic-red'
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
        }
      >
        <SettingItemTab title={t('email-verification')}>
          <StatusValue ok={Boolean(user.email)}>
            {user.email ? t('verified') : t('unverified')}
          </StatusValue>
        </SettingItemTab>
        <SettingItemTab title={t('password-protection')}>
          <StatusValue ok={hasPassword}>
            {hasPassword ? t('protected') : t('weak')}
          </StatusValue>
        </SettingItemTab>
        <SettingItemTab title={t('account-age')}>
          <span className="text-sm">
            {t('days-old', { days: accountAgeDays })}
          </span>
        </SettingItemTab>

        {(!user.email || securityLevel === 'warning') && (
          <SettingItemTab
            layout="stacked"
            title={t('security-recommendations')}
            description={t('security-recommendations-description')}
            icon={<AlertTriangle className="size-4 text-dynamic-yellow" />}
          >
            <ul className="list-inside list-disc space-y-1 text-muted-foreground text-sm">
              {!user.email && <li>{t('verify-email-recommendation')}</li>}
              <li>{t('link-additional-accounts-recommendation')}</li>
              <li>{t('enable-2fa-recommendation')}</li>
            </ul>
          </SettingItemTab>
        )}
      </SettingsSection>

      <SettingsSection title={tCommon('sign_in')}>
        <SettingItemTab
          title={t('password-management')}
          description={t('password-management-description')}
        >
          <ResetPasswordDialog />
        </SettingItemTab>
        <PasskeysSettings />
      </SettingsSection>

      <SettingsSection
        title={t('two-factor-authentication')}
        description={t('two-factor-authentication-description')}
      >
        <MFAMethodList />
      </SettingsSection>

      {children}

      <SettingsSection>
        <SettingItemTab
          title={t('active-sessions')}
          description={t('active-sessions-description', {
            count: activeSessions,
          })}
        >
          <Button
            variant="outline"
            size="sm"
            type="button"
            onClick={onOpenSessions}
          >
            <Eye className="h-4 w-4" />
            {t('view-sessions')}
          </Button>
        </SettingItemTab>
      </SettingsSection>

      <div className="space-y-1 text-muted-foreground text-sm">
        <p className="font-medium text-foreground">{t('security-tips')}</p>
        <p>{t('security-tips-description')}</p>
        <ul className="list-inside list-disc space-y-1">
          <li>{t('use-strong-passwords-tip')}</li>
          <li>{t('avoid-public-wifi-tip')}</li>
          <li>{t('regular-logout-tip')}</li>
          <li>{t('monitor-account-activity-tip')}</li>
        </ul>
      </div>

      <SettingsSection title={t('delete-account-danger-zone')}>
        <SettingItemTab
          title={t('delete-account')}
          description={t('delete-account-danger-description')}
        >
          <Button variant="destructive" size="sm" asChild>
            <Link href="/account/delete">
              <AlertTriangle className="h-4 w-4" />
              {t('delete-account')}
            </Link>
          </Button>
        </SettingItemTab>
      </SettingsSection>
    </div>
  );
}
