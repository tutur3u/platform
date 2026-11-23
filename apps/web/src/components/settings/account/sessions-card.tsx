'use client';

import { LogOut } from '@tuturuuu/icons';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@tuturuuu/ui/alert-dialog';
import { Button } from '@tuturuuu/ui/button';
import { SettingItemTab } from '@tuturuuu/ui/custom/settings-item-tab';
import {
  SettingsSection,
  SettingsSectionBlock,
  SettingsSectionMessage,
} from '@tuturuuu/ui/custom/settings-section';
import { Progress } from '@tuturuuu/ui/progress';
import {
  LoadingRegion,
  Skeleton,
  skeletonClassName,
} from '@tuturuuu/ui/skeleton';
import { cn } from '@tuturuuu/utils/format';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import {
  disambiguateSessionIdentifiers,
  groupSessions,
  maskSessionIp,
} from '@/lib/sessions/session-display';
import { describeSessionUserAgent } from '@/lib/sessions/session-user-agent';
import {
  formatSessionClientLabel,
  SessionRow,
  type SessionRowData,
} from './session-row';

type Session = SessionRowData;

interface SessionStats {
  total_sessions: number;
  active_sessions: number;
  current_session_age: string | null;
}

interface SessionsData {
  sessions: Session[];
  stats: SessionStats;
}

// Time ago formatter that leverages i18n translations
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getTimeAgoFormatter(t: any) {
  return (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInMs = now.getTime() - date.getTime();
    const diffInMinutes = Math.floor(diffInMs / (1000 * 60));
    const diffInHours = Math.floor(diffInMinutes / 60);
    const diffInDays = Math.floor(diffInHours / 24);

    if (diffInMinutes < 1) return t('time.just_now');
    if (diffInMinutes < 60)
      return t('time.minutes_ago', { count: diffInMinutes });
    if (diffInHours < 24) return t('time.hours_ago', { count: diffInHours });
    return t('time.days_ago', { count: diffInDays });
  };
}

const REQUEST_DELAY_MS = 250; // 250 ms delay between bulk revocation requests to avoid spamming the server

export default function SessionsCard() {
  const [sessionsData, setSessionsData] = useState<SessionsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [revokingIds, setRevokingIds] = useState<string[]>([]);
  const [revokingAll, setRevokingAll] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{
    completed: number;
    total: number;
  }>({
    completed: 0,
    total: 0,
  });

  const t = useTranslations('sessions-card');
  const tCommon = useTranslations('common');

  const formatTimeAgo = getTimeAgoFormatter(t);

  const fetchSessions = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/v1/users/sessions');
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch sessions');
      }
      const data = await response.json();
      setSessionsData(data);
    } catch (error) {
      // The API and the browser report errors in English, so the detail goes
      // to the console and the toast stays localized.
      console.error('Error fetching sessions:', error);
      toast.error(t('load_failed'));
      setSessionsData(null);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const revokeSession = async (
    sessionId: string,
    showToast: boolean = true
  ) => {
    try {
      setRevokingIds((prev) => [...prev, sessionId]);
      const response = await fetch(`/api/v1/users/sessions/${sessionId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to revoke session');
      }

      if (showToast) {
        toast.success(t('revoke_success'));
      }
      await fetchSessions(); // Refresh the list
    } catch (error) {
      console.error('Error revoking session:', error);
      toast.error(t('revoke_failed'));
    } finally {
      setRevokingIds((prev) => prev.filter((id) => id !== sessionId));
    }
  };

  const revokeAllOtherSessions = async () => {
    if (!sessionsData) return;

    const idsToRevoke = sessionsData.sessions
      .filter((s) => !s.is_current)
      .map((s) => s.session_id);

    if (idsToRevoke.length === 0) return;

    setRevokingAll(true);
    setBulkProgress({ completed: 0, total: idsToRevoke.length });
    setRevokingIds((prev) => [...new Set([...prev, ...idsToRevoke])]);

    let successCount = 0;
    let failureCount = 0;

    for (const id of idsToRevoke) {
      try {
        const response = await fetch(`/api/v1/users/sessions/${id}`, {
          method: 'DELETE',
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to revoke session');
        }

        successCount += 1;
      } catch (error) {
        console.error(`Error revoking session ${id}:`, error);
        failureCount += 1;
      } finally {
        setRevokingIds((prev) => prev.filter((sid) => sid !== id));
        setBulkProgress((prev) => ({
          ...prev,
          completed: prev.completed + 1,
        }));
        // Throttle requests to avoid overwhelming the server
        await new Promise((resolve) => setTimeout(resolve, REQUEST_DELAY_MS));
      }
    }

    await fetchSessions();

    if (failureCount === 0) {
      toast.success(t('revoke_all_success'));
    } else {
      toast.warning(
        t('revoke_all_partial', {
          failed: failureCount,
          revoked: successCount,
        })
      );
    }

    setRevokingAll(false);
    setBulkProgress({ completed: 0, total: 0 });
  };

  if (loading) {
    return (
      <SettingsSection
        title={t('title')}
        description={
          <span
            aria-hidden="true"
            className={cn(skeletonClassName, 'inline-block h-3.5 w-64 max-w-full')}
          />
        }
      >
        <LoadingRegion srLabel={t('loading_description')}>
          {[1, 2, 3].map((i) => (
            <SettingsSectionBlock className="space-y-2" key={i}>
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </SettingsSectionBlock>
          ))}
        </LoadingRegion>
      </SettingsSection>
    );
  }

  if (!sessionsData) {
    return (
      <SettingsSection title={t('title')}>
        <SettingsSectionMessage
          action={
            <Button onClick={fetchSessions} variant="outline" size="sm">
              {t('try_again')}
            </Button>
          }
        >
          {t('failed_description')}
        </SettingsSectionMessage>
      </SettingsSection>
    );
  }

  const { sessions, stats } = sessionsData;
  const grouped = groupSessions(sessions, {
    isCurrent: (session) => session.is_current,
    lastActive: (session) => new Date(session.updated_at),
    now: new Date(),
  });
  const groups = [
    {
      key: 'current',
      title: t('this_device'),
      sessions: grouped.current ? [grouped.current] : [],
    },
    { key: 'recent', title: t('active_recently'), sessions: grouped.recent },
    { key: 'older', title: t('older'), sessions: grouped.older },
  ];
  const rowMeta = groups.flatMap((group) =>
    group.sessions.map((session) => {
      const label = formatSessionClientLabel(
        describeSessionUserAgent(session.user_agent),
        t
      );
      const lastActive = formatTimeAgo(session.updated_at);
      const context = [maskSessionIp(session.ip), lastActive]
        .filter(Boolean)
        .join(', ');
      return {
        id: session.session_id,
        label,
        lastActive,
        context: context.length > 0 ? context : null,
      };
    })
  );
  const disambiguations = disambiguateSessionIdentifiers(rowMeta);
  const metaById = new Map(
    rowMeta.map((item) => {
      const dis = disambiguations.get(item.id);
      let identifier = item.label;
      if (dis?.duplicated) {
        if (dis.context && dis.ordinal !== null) {
          identifier = t('session_with_context_ordinal', {
            label: item.label,
            context: dis.context,
            ordinal: dis.ordinal,
          });
        } else if (dis.context) {
          identifier = t('session_with_context', {
            label: item.label,
            context: dis.context,
          });
        } else if (dis.ordinal !== null) {
          identifier = t('session_ordinal', {
            label: item.label,
            ordinal: dis.ordinal,
          });
        }
      }
      return [
        item.id,
        {
          lastActive: item.lastActive,
          identifier,
          ordinal: dis?.ordinal ?? null,
        },
      ] as const;
    })
  );

  return (
    <>
      <SettingsSection
        title={t('overview_title')}
        description={t('overview_description')}
      >
        <SettingItemTab title={t('total_sessions')}>
          <span className="text-sm tabular-nums">{stats.total_sessions}</span>
        </SettingItemTab>
        <SettingItemTab title={t('active_sessions')}>
          <span className="text-sm tabular-nums">{stats.active_sessions}</span>
        </SettingItemTab>
        <SettingItemTab title={t('current_session_age')}>
          <span className="text-sm tabular-nums">
            {stats.current_session_age
              ? `${Math.floor(parseInt(stats.current_session_age.split(':')[0] || '0', 10) / 24)}d`
              : 'N/A'}
          </span>
        </SettingItemTab>
      </SettingsSection>

      {sessions.length === 0 && (
        <SettingsSection title={t('title')}>
          <SettingsSectionMessage>
            {t('no_active_sessions')}
          </SettingsSectionMessage>
        </SettingsSection>
      )}

      {groups.map(
        (group) =>
          group.sessions.length > 0 && (
            <SettingsSection key={group.key} title={group.title}>
              {group.sessions.map((session) => {
                const meta = metaById.get(session.session_id);
                return (
                  <SessionRow
                    key={session.session_id}
                    session={session}
                    lastActive={
                      meta?.lastActive ?? formatTimeAgo(session.updated_at)
                    }
                    identifier={meta?.identifier}
                    ordinal={meta?.ordinal ?? null}
                    revoking={revokingIds.includes(session.session_id)}
                    onRevoke={() => revokeSession(session.session_id)}
                  />
                );
              })}
            </SettingsSection>
          )
      )}

      {sessions.length > 1 && (
        <SettingsSection>
          <SettingItemTab
            title={t('sign_out_all_others')}
            description={t('sign_out_all_confirm_description')}
          >
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" disabled={revokingAll}>
                  <LogOut className="h-4 w-4" />
                  {revokingAll ? t('revoking') : t('sign_out_all')}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    {t('sign_out_all_question')}
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    {t('sign_out_all_confirm_description')}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{tCommon('cancel')}</AlertDialogCancel>
                  <AlertDialogAction onClick={revokeAllOtherSessions}>
                    {t('sign_out_all_others')}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </SettingItemTab>
          {revokingAll && bulkProgress.total > 0 && (
            <SettingsSectionBlock className="space-y-2">
              {/* The shared Progress keeps `value` for its indicator, so the
                  bar gets its name and value here. The count is requests
                  finished, whether or not each one succeeded. */}
              <Progress
                aria-label={t('revoke_progress_label')}
                aria-valuenow={Math.round(
                  (bulkProgress.completed / bulkProgress.total) * 100
                )}
                aria-valuetext={t('revoke_progress', {
                  completed: bulkProgress.completed,
                  total: bulkProgress.total,
                })}
                value={(bulkProgress.completed / bulkProgress.total) * 100}
              />
              <div className="text-foreground text-sm">
                {t('revoke_progress', {
                  completed: bulkProgress.completed,
                  total: bulkProgress.total,
                })}
              </div>
            </SettingsSectionBlock>
          )}
        </SettingsSection>
      )}
    </>
  );
}
