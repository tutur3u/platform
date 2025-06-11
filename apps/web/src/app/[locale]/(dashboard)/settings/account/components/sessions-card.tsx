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

function formatTimeAgo(dateString: string) {
  const date = new Date(dateString);
  const now = new Date();
  const diffInMs = now.getTime() - date.getTime();
  const diffInMinutes = Math.floor(diffInMs / (1000 * 60));
  const diffInHours = Math.floor(diffInMinutes / 60);
  const diffInDays = Math.floor(diffInHours / 24);

  if (diffInMinutes < 1) return 'Just now';
  if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
  if (diffInHours < 24) return `${diffInHours}h ago`;
  return `${diffInDays}d ago`;
}

export default function SessionsCard() {
  const [sessionsData, setSessionsData] = useState<SessionsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [revokingAll, setRevokingAll] = useState(false);

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

  const revokeSession = async (sessionId: string) => {
    try {
      setRevoking(sessionId);
      const response = await fetch(`/api/v1/users/sessions/${sessionId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to revoke session');
      }

      toast.success('Session revoked successfully');
      await fetchSessions(); // Refresh the list
    } catch (error) {
      console.error('Error revoking session:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to revoke session'
      );
    } finally {
      setRevoking(null);
    }
  };

  const revokeAllOtherSessions = async () => {
    try {
      setRevokingAll(true);
      const response = await fetch('/api/v1/users/sessions', {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to revoke sessions');
      }

      const data = await response.json();
      toast.success(data.message || 'All other sessions revoked successfully');
      await fetchSessions(); // Refresh the list
    } catch (error) {
      console.error('Error revoking all sessions:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to revoke sessions'
      );
    } finally {
      setRevokingAll(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Active Sessions</CardTitle>
          <CardDescription>Loading your active sessions...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse">
                <div className="mb-2 h-4 w-3/4 rounded bg-dynamic-gray/20"></div>
                <div className="h-3 w-1/2 rounded bg-dynamic-gray/20"></div>
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
          <CardTitle>Active Sessions</CardTitle>
          <CardDescription>
            Failed to load session data. Please try refreshing the page.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Button onClick={fetchSessions} variant="outline">
              Try Again
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
          <CardTitle>Session Overview</CardTitle>
          <CardDescription>
            Overview of your account sessions and security status
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <div className="text-2xl font-bold text-dynamic-blue">
                {stats.total_sessions}
              </div>
              <div className="text-sm text-dynamic-gray">Total Sessions</div>
            </div>
            <div className="space-y-2">
              <div className="text-2xl font-bold text-dynamic-green">
                {stats.active_sessions}
              </div>
              <div className="text-sm text-dynamic-gray">Active Sessions</div>
            </div>
            <div className="space-y-2">
              <div className="text-2xl font-bold text-dynamic-orange">
                {stats.current_session_age
                  ? `${Math.floor(parseInt(stats.current_session_age.split(':')[0] || '0') / 24)}d`
                  : 'N/A'}
              </div>
              <div className="text-sm text-dynamic-gray">
                Current Session Age
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Active Sessions */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Active Sessions</CardTitle>
            <CardDescription>
              Manage devices and browsers that are signed into your account
            </CardDescription>
          </div>
          {sessions.length > 1 && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" disabled={revokingAll}>
                  <LogOut className="mr-2 h-4 w-4" />
                  {revokingAll ? 'Revoking...' : 'Sign Out All Other Sessions'}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    Sign Out All Other Sessions?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    This will sign you out of all other devices and browsers.
                    You'll remain signed in on this device.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={revokeAllOtherSessions}>
                    Sign Out All Others
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {sessions.length === 0 ? (
              <div className="py-8 text-center text-dynamic-gray">
                No active sessions found
              </div>
            ) : (
              sessions.map((session, index) => (
                <div key={session.session_id}>
                  <div className="flex items-center justify-between rounded-lg border border-dynamic-gray/20 p-4">
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
                              Current Session
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center space-x-4 text-sm text-dynamic-gray">
                          <div className="flex items-center space-x-1">
                            <MapPin className="h-3 w-3" />
                            <span>{session.ip}</span>
                          </div>
                          <div className="flex items-center space-x-1">
                            <Clock className="h-3 w-3" />
                            <span>
                              Last active {formatTimeAgo(session.updated_at)}
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
                            disabled={revoking === session.session_id}
                          >
                            <Trash2 className="h-4 w-4" />
                            {revoking === session.session_id
                              ? 'Revoking...'
                              : 'Revoke'}
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Revoke Session?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will sign out the device/browser and it will
                              need to sign in again to access your account.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => revokeSession(session.session_id)}
                            >
                              Revoke Session
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
