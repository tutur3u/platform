'use client';

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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import { Progress } from '@tuturuuu/ui/progress';
import { Separator } from '@tuturuuu/ui/separator';
import {
  Clock,
  LogOut,
  MapPin,
  Monitor,
  Smartphone,
  Tablet,
  Trash2,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

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
  const ua = userAgent.toLowerCase();
  if (
    ua.includes('mobile') ||
    ua.includes('android') ||
    ua.includes('iphone')
  ) {
    return <Smartphone className="h-4 w-4" />;
  }
  if (ua.includes('tablet') || ua.includes('ipad')) {
    return <Tablet className="h-4 w-4" />;
  }
  return <Monitor className="h-4 w-4" />;
}

function formatUserAgent(userAgent: string) {
  if (userAgent === 'Unknown') return 'Unknown Device';

  // Extract browser and OS info
  let browser = 'Unknown Browser';
  let os = 'Unknown OS';

  if (userAgent.includes('Chrome')) browser = 'Chrome';
  else if (userAgent.includes('Firefox')) browser = 'Firefox';
  else if (userAgent.includes('Safari') && !userAgent.includes('Chrome'))
    browser = 'Safari';
  else if (userAgent.includes('Edge')) browser = 'Edge';

  if (userAgent.includes('Windows')) os = 'Windows';
  else if (userAgent.includes('Mac')) os = 'macOS';
  else if (userAgent.includes('Linux')) os = 'Linux';
  else if (userAgent.includes('Android')) os = 'Android';
  else if (userAgent.includes('iOS')) os = 'iOS';

  return `${browser} on ${os}`;
}

// Time ago formatter that leverages i18n translations
function getTimeAgoFormatter(t: ReturnType<typeof useTranslations>) {
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

  const fetchSessions = async () => {
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
  };

  useEffect(() => {
    fetchSessions();
  }, []);

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
      <Card>
        <CardHeader>
          <CardTitle>{t('title')}</CardTitle>
          <CardDescription>{t('loading_description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse">
                <div className="mb-2 h-4 w-3/4 rounded bg-foreground/20"></div>
                <div className="h-3 w-1/2 rounded bg-foreground/20"></div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!sessionsData) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('title')}</CardTitle>
          <CardDescription>{t('failed_description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Button onClick={fetchSessions} variant="outline">
              {t('try_again')}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const { sessions, stats } = sessionsData;

  return (
    <div className="space-y-6">
      {/* Session Statistics */}
      <Card>
        <CardHeader>
          <CardTitle>{t('overview_title')}</CardTitle>
          <CardDescription>{t('overview_description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <div className="text-2xl font-bold text-dynamic-blue">
                {stats.total_sessions}
              </div>
              <div className="text-sm text-foreground">
                {t('total_sessions')}
              </div>
            </div>
            <div className="space-y-2">
              <div className="text-2xl font-bold text-dynamic-green">
                {stats.active_sessions}
              </div>
              <div className="text-sm text-foreground">
                {t('active_sessions')}
              </div>
            </div>
            <div className="space-y-2">
              <div className="text-2xl font-bold text-dynamic-orange">
                {stats.current_session_age
                  ? `${Math.floor(parseInt(stats.current_session_age.split(':')[0] || '0') / 24)}d`
                  : 'N/A'}
              </div>
              <div className="text-sm text-foreground">
                {t('current_session_age')}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Active Sessions */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div className="grid gap-2">
            <CardTitle>{t('title')}</CardTitle>
            <CardDescription>{t('manage_description')}</CardDescription>
          </div>
          {sessions.length > 1 && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" disabled={revokingAll}>
                  <LogOut className="mr-2 h-4 w-4" />
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
          )}
        </CardHeader>
        <CardContent>
          {revokingAll && bulkProgress.total > 0 && (
            <div className="mb-6 space-y-2">
              <Progress
                value={(bulkProgress.completed / bulkProgress.total) * 100}
              />
              <div className="text-sm text-foreground">
                Revoked {bulkProgress.completed} of {bulkProgress.total}
              </div>
            </div>
          )}
          <div className="space-y-4">
            {sessions.length === 0 ? (
              <div className="py-8 text-center text-foreground">
                {t('no_active_sessions')}
              </div>
            ) : (
              sessions.map((session, index) => (
                <div key={session.session_id}>
                  <div className="flex items-center justify-between rounded-lg border border-foreground/20 p-4">
                    <div className="flex flex-1 items-center space-x-4">
                      <div className="text-dynamic-blue">
                        {getDeviceIcon(session.user_agent)}
                      </div>
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center space-x-2">
                          <div className="font-medium">
                            {formatUserAgent(session.user_agent)}
                          </div>
                          {session.is_current && (
                            <Badge
                              variant="secondary"
                              className="border-dynamic-green/30 bg-dynamic-green/10 text-dynamic-green"
                            >
                              {t('current_session')}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center space-x-4 text-sm text-foreground">
                          <div className="flex items-center space-x-1">
                            <MapPin className="h-3 w-3" />
                            <span>{session.ip}</span>
                          </div>
                          <div className="flex items-center space-x-1 text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            <span>
                              {t('last_active')}{' '}
                              {formatTimeAgo(session.updated_at)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                    {!session.is_current && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="destructive"
                            size="sm"
                            disabled={revokingIds.includes(session.session_id)}
                          >
                            <Trash2 className="h-4 w-4" />
                            {revokingIds.includes(session.session_id)
                              ? 'Revoking...'
                              : 'Revoke'}
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
                            <AlertDialogCancel>
                              {tCommon('cancel')}
                            </AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => revokeSession(session.session_id)}
                            >
                              {t('revoke_session')}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                  {index < sessions.length - 1 && (
                    <Separator className="my-4" />
                  )}
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
