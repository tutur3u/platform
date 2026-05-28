'use client';

import { SHOW_VERSION_BADGE_CONFIG_ID } from '@tuturuuu/internal-api/users';
import { useUserBooleanConfig } from '@tuturuuu/ui/hooks/use-user-config';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@tuturuuu/ui/hover-card';
import { Switch } from '@tuturuuu/ui/switch';
import { cn } from '@tuturuuu/utils/format';
import type { PlatformReleaseInfo } from '@tuturuuu/utils/platform-release';
import { useTranslations } from 'next-intl';
import { SettingItemTab } from './settings-item-tab';

type VersionBadgeProps = {
  className?: string;
  release: PlatformReleaseInfo;
};

type VersionBadgeSettingProps = {
  canManage: boolean;
};

function DetailRow({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-3 text-xs">
      <dt className="text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          'min-w-0 whitespace-pre-wrap break-words font-mono text-foreground [overflow-wrap:anywhere]',
          valueClassName
        )}
      >
        {value}
      </dd>
    </div>
  );
}

export function VersionBadge({ className, release }: VersionBadgeProps) {
  const t = useTranslations('version-badge');
  const { isLoading, value: enabled } = useUserBooleanConfig(
    SHOW_VERSION_BADGE_CONFIG_ID,
    false
  );

  if (isLoading || !enabled) {
    return null;
  }

  const sourceDetails = [
    [t('app'), release.appName],
    [t('version'), release.version],
    [t('commit'), release.shortCommitHash],
    [t('commit_hash'), release.commitHash],
    [t('commit_message'), release.commitMessage],
  ] as const;
  const deploymentDetails = [
    [t('ref'), release.refName],
    [t('environment'), release.environment],
    [t('deployment_time'), release.builtAt],
    [t('deployment_url'), release.deploymentUrl ?? t('not_available')],
    [t('deployment_stamp'), release.deploymentStamp ?? t('not_available')],
  ] as const;

  return (
    <HoverCard openDelay={120}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          aria-label={t('trigger_label')}
          className={cn(
            'fixed right-3 bottom-3 z-1000 rounded-md border border-border/70 bg-background/90 px-2 py-1 font-mono text-muted-foreground text-xs shadow-lg backdrop-blur-xl transition hover:border-dynamic-blue/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dynamic-blue',
            className
          )}
        >
          v{release.version}
        </button>
      </HoverCardTrigger>
      <HoverCardContent
        align="end"
        className="w-[24rem] max-w-[calc(100vw-1rem)] p-0"
      >
        <div className="overflow-hidden rounded-md">
          <div className="border-border/70 border-b bg-muted/30 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-sm">{t('title')}</p>
                <p className="mt-0.5 text-muted-foreground text-xs">
                  {t('description')}
                </p>
              </div>
              <span className="shrink-0 rounded-md border border-border/70 bg-background px-2 py-1 font-mono text-muted-foreground text-xs">
                v{release.version}
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="min-w-0 max-w-full rounded-md border border-border/70 bg-background px-2 py-1 font-mono text-foreground text-xs">
                {release.shortCommitHash}
              </span>
              <span className="min-w-0 max-w-full rounded-md border border-border/70 bg-background px-2 py-1 font-mono text-muted-foreground text-xs">
                {release.environment}
              </span>
            </div>
          </div>
          <div className="space-y-3 p-4">
            <dl className="space-y-2">
              {sourceDetails.map(([label, value]) => (
                <DetailRow key={label} label={label} value={value} />
              ))}
            </dl>
            <div className="border-border/70 border-t" />
            <dl className="space-y-2">
              {deploymentDetails.map(([label, value]) => (
                <DetailRow key={label} label={label} value={value} />
              ))}
            </dl>
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

export function VersionBadgeSetting({ canManage }: VersionBadgeSettingProps) {
  if (!canManage) {
    return null;
  }

  return <VersionBadgeSettingControl />;
}

function VersionBadgeSettingControl() {
  const t = useTranslations('version-badge');
  const {
    isLoading,
    isPending,
    setValue,
    value: enabled,
  } = useUserBooleanConfig(SHOW_VERSION_BADGE_CONFIG_ID, false);

  return (
    <SettingItemTab
      title={t('setting_title')}
      description={t('setting_description')}
    >
      <div className="flex items-center gap-3">
        <span className="rounded-md border border-border/70 bg-muted/40 px-2 py-1 font-mono text-muted-foreground text-xs">
          {SHOW_VERSION_BADGE_CONFIG_ID}={enabled ? 'true' : 'false'}
        </span>
        <Switch
          aria-label={t('setting_toggle_label')}
          checked={enabled}
          disabled={isLoading || isPending}
          onCheckedChange={setValue}
        />
      </div>
    </SettingItemTab>
  );
}
