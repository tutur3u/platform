'use client';

import { LogOut, Monitor, Smartphone, Tablet, Trash2 } from '@tuturuuu/icons';
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
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { SettingItemTab } from '@tuturuuu/ui/custom/settings-item-tab';
import {
  SettingsSection,
  SettingsSectionBlock,
  SettingsSectionMessage,
} from '@tuturuuu/ui/custom/settings-section';
import { Progress } from '@tuturuuu/ui/progress';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import { describeSessionUserAgent } from '@/lib/sessions/session-user-agent';

interface Session {
  session_id: string;
  created_at: string;
  updated_at: string;
  user_agent: string;
  ip: string;
  is_current: boolean;
}

interface SessionStats {
  total_sessions: number;
  active_sessions: number;
  current_session_age: string | null;
}

interface SessionsData {
  sessions: Session[];
  stats: SessionStats;
}

function getDeviceIcon(userAgent: string) {
  const device = describeSessionUserAgent(userAgent).device;
  if (device === 'phone') {
    return <Smartphone className="h-4 w-4" />;
  }
  if (device === 'tablet') {
    return <Tablet className="h-4 w-4" />;
  }
  return <Monitor className="h-4 w-4" />;
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
      console.error('Error fetching sessions:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to load sessions'
      );
      setSessionsData(null);
    } finally {
      setLoading(false);
    }
  }, []);

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
        toast.success('Session revoked successfully');
      }
      await fetchSessions(); // Refresh the list
    } catch (error) {
      console.error('Error revoking session:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to revoke session'
      );
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
      toast.success('All other sessions revoked successfully');
    } else {
      toast.warning(
        `Revoked ${successCount} session${
          successCount !== 1 ? 's' : ''
        }, but ${failureCount} failed. Please try again.`
      );
    }

    setRevokingAll(false);
    setBulkProgress({ completed: 0, total: 0 });
  };

  if (loading) {
    return (
      <SettingsSection
        title={t('title')}
        description={t('loading_description')}
      >
        {[1, 2, 3].map((i) => (
          <SettingsSectionBlock className="space-y-2" key={i}>
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </SettingsSectionBlock>
        ))}
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

      <SettingsSection title={t('title')} description={t('manage_description')}>
        {revokingAll && bulkProgress.total > 0 && (
          <SettingsSectionBlock className="space-y-2">
            <Progress
              value={(bulkProgress.completed / bulkProgress.total) * 100}
            />
            <div className="text-foreground text-sm">
              Revoked {bulkProgress.completed} of {bulkProgress.total}
            </div>
          </SettingsSectionBlock>
        )}
        {sessions.length === 0 ? (
          <SettingsSectionMessage>
            {t('no_active_sessions')}
          </SettingsSectionMessage>
        ) : (
          sessions.map((session) => (
            <SettingItemTab
              key={session.session_id}
              layout="compact"
              title={
                <>
                  {describeSessionUserAgent(session.user_agent).label}
                  {session.is_current && (
                    <Badge
                      variant="outline"
                      className="border-dynamic-green/30 bg-dynamic-green/10 text-dynamic-green text-xs"
                    >
                      {t('current_session')}
                    </Badge>
                  )}
                </>
              }
              description={`${session.ip} · ${t('last_active')} ${formatTimeAgo(session.updated_at)}`}
              icon={getDeviceIcon(session.user_agent)}
            >
              {!session.is_current && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                      disabled={revokingIds.includes(session.session_id)}
                    >
                      <Trash2 className="h-4 w-4" />
                      <span className="sr-only">
                        {revokingIds.includes(session.session_id)
                          ? 'Revoking...'
                          : 'Revoke'}
                      </span>
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        {t('revoke_session_question')}
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        {t('revoke_session_description')}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{tCommon('cancel')}</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => revokeSession(session.session_id)}
                      >
                        {t('revoke_session')}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </SettingItemTab>
          ))
        )}
      </SettingsSection>

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
        </SettingsSection>
      )}
    </>
  );
}
