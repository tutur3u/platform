'use client';

import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle, Mail, XCircle } from '@tuturuuu/icons';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';

interface EmailStats {
  period: string;
  wsId: string;
  emailStats: {
    total: number;
    sent: number;
    failed: number;
    bounced: number;
    complained: number;
  };
  bounceStats: {
    total_events: number;
    hard_bounces: number;
    soft_bounces: number;
    complaints: number;
    unique_emails_affected: number;
  };
}

interface EmailStatsDashboardProps {
  period?: '24h' | '7d' | '30d';
  wsId?: string;
}

export function EmailStatsDashboard({
  period = '24h',
  wsId,
}: EmailStatsDashboardProps) {
  const { data, isLoading, error } = useQuery<EmailStats>({
    queryKey: ['email-stats', period, wsId],
    queryFn: async () => {
      const params = new URLSearchParams({ period });
      if (wsId) params.set('wsId', wsId);

      const response = await fetch(`/api/v1/admin/email/stats?${params}`);
      if (!response.ok) {
        throw new Error('Failed to fetch email stats');
      }
      return response.json();
    },
    staleTime: 30 * 1000, // 30 seconds
  });

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div className="h-4 w-24 rounded bg-muted" />
              <div className="h-4 w-4 rounded bg-muted" />
            </CardHeader>
            <CardContent>
              <div className="h-8 w-16 rounded bg-muted" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive">
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-4 w-4" />
            <span>Failed to load email statistics</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  const stats = data?.emailStats || {
    total: 0,
    sent: 0,
    failed: 0,
    bounced: 0,
    complained: 0,
  };
  const bounceStats = data?.bounceStats || {
    total_events: 0,
    hard_bounces: 0,
    soft_bounces: 0,
    complaints: 0,
    unique_emails_affected: 0,
  };

  const successRate =
    stats.total > 0 ? ((stats.sent / stats.total) * 100).toFixed(1) : '0';

  return (
    <div className="space-y-4">
      {/* Main Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="font-medium text-sm">Total Emails</CardTitle>
            <Mail className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="font-bold text-2xl">{stats.total}</div>
            <p className="text-muted-foreground text-xs">
              Last{' '}
              {period === '24h'
                ? '24 hours'
                : period === '7d'
                  ? '7 days'
                  : '30 days'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="font-medium text-sm">Sent</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="font-bold text-2xl text-green-600">
              {stats.sent}
            </div>
            <p className="text-muted-foreground text-xs">
              {successRate}% success rate
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="font-medium text-sm">Failed</CardTitle>
            <XCircle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="font-bold text-2xl text-red-600">
              {stats.failed}
            </div>
            <p className="text-muted-foreground text-xs">Delivery failures</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="font-medium text-sm">
              Bounced/Complaints
            </CardTitle>
            <AlertTriangle className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="font-bold text-2xl text-yellow-600">
              {stats.bounced + stats.complained}
            </div>
            <p className="text-muted-foreground text-xs">
              {stats.bounced} bounced, {stats.complained} complaints
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Bounce Stats */}
      <Card>
        <CardHeader>
          <CardTitle className="font-medium text-sm">
            Bounce & Complaint Details (30 days)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
            <div>
              <p className="text-muted-foreground text-sm">Total Events</p>
              <p className="font-semibold text-lg">
                {bounceStats.total_events}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground text-sm">Hard Bounces</p>
              <p className="font-semibold text-lg text-red-600">
                {bounceStats.hard_bounces}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground text-sm">Soft Bounces</p>
              <p className="font-semibold text-lg text-yellow-600">
                {bounceStats.soft_bounces}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground text-sm">Complaints</p>
              <p className="font-semibold text-lg text-orange-600">
                {bounceStats.complaints}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground text-sm">Affected Emails</p>
              <p className="font-semibold text-lg">
                {bounceStats.unique_emails_affected}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
