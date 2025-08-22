'use client';

import { useQuery } from '@tanstack/react-query';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import {
  Calendar,
  Clock,
  Download,
  Eye,
  Filter,
  Search,
} from '@tuturuuu/ui/icons';
import { Input } from '@tuturuuu/ui/input';
import { useParams } from 'next/navigation';
import { useState } from 'react';

// Helper function to format duration
const formatDuration = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
};

export default function TimeTrackerHistoryPage() {
  const params = useParams();
  const wsId = params.wsId as string;
  const [searchQuery, setSearchQuery] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Fetch real history data
  const { data: historyData, isLoading } = useQuery({
    queryKey: ['time-tracking-history', wsId, startDate, endDate],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);

      const response = await fetch(
        `/api/v1/workspaces/${wsId}/time-tracking/sessions?type=history&${params}`
      );
      if (!response.ok) throw new Error('Failed to fetch history');
      return response.json();
    },
    refetchInterval: 300000, // 5 minutes
  });

  // Fetch history statistics
  const { data: statsData } = useQuery({
    queryKey: ['time-tracking-history-stats', wsId, startDate, endDate],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);

      const response = await fetch(
        `/api/v1/workspaces/${wsId}/time-tracking/sessions?type=history-stats&${params}`
      );
      if (!response.ok) throw new Error('Failed to fetch history stats');
      return response.json();
    },
  });

  // Filter sessions based on search
  const filteredSessions =
    historyData?.sessions?.filter(
      (session: any) =>
        session.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        session.description
          ?.toLowerCase()
          .includes(searchQuery.toLowerCase()) ||
        session.category?.name.toLowerCase().includes(searchQuery.toLowerCase())
    ) || [];

  // Calculate real statistics
  const totalEntries = statsData?.totalEntries || 0;
  const totalHours = statsData?.totalHours || 0;
  const activeProjects = statsData?.activeProjects || 0;
  const avgDailyHours = statsData?.avgDailyHours || 0;

  return (
    <div className="container mx-auto space-y-6 p-6">
      <div className="mb-6 flex items-center gap-2">
        <Clock className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Time Tracker History</h1>
      </div>

      {/* Search and Filter Bar */}
      <Card>
        <CardHeader>
          <CardTitle>Search & Filter</CardTitle>
          <CardDescription>
            Find specific time entries in your history
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <div className="relative">
              <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 transform text-muted-foreground" />
              <Input
                placeholder="Search entries..."
                className="pl-10"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <Input
              type="date"
              placeholder="Start date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
            <Input
              type="date"
              placeholder="End date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
            <Button variant="outline" className="flex items-center gap-2">
              <Filter className="h-4 w-4" />
              Filter
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* History Summary */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Entries</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalEntries}</div>
            <p className="text-xs text-muted-foreground">This month</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Hours</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatDuration(totalHours)}
            </div>
            <p className="text-xs text-muted-foreground">
              +15.2% from last month
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Active Projects
            </CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeProjects}</div>
            <p className="text-xs text-muted-foreground">Currently tracking</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Avg. Daily Hours
            </CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {avgDailyHours.toFixed(1)}h
            </div>
            <p className="text-xs text-muted-foreground">Target: 8.0h</p>
          </CardContent>
        </Card>
      </div>

      {/* Time Entries List */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Recent Time Entries</CardTitle>
              <CardDescription>
                Your time tracking history for the last 30 days
              </CardDescription>
            </div>
            <Button variant="outline" className="flex items-center gap-2">
              <Download className="h-4 w-4" />
              Export
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="text-muted-foreground">Loading history...</div>
            </div>
          ) : filteredSessions.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <div className="text-muted-foreground">
                {searchQuery
                  ? 'No entries match your search'
                  : 'No time entries available'}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredSessions.slice(0, 10).map((session: any) => (
                <div
                  key={session.id}
                  className="flex items-center justify-between rounded-lg border p-4 transition-colors hover:bg-accent/50"
                >
                  <div className="flex items-center gap-4">
                    <div
                      className={`h-3 w-3 rounded-full ${
                        session.category?.color === 'red'
                          ? 'bg-red-500'
                          : session.category?.color === 'green'
                            ? 'bg-green-500'
                            : session.category?.color === 'yellow'
                              ? 'bg-yellow-500'
                              : session.category?.color === 'purple'
                                ? 'bg-purple-500'
                                : session.category?.color === 'orange'
                                  ? 'bg-orange-500'
                                  : 'bg-blue-500'
                      }`}
                    ></div>
                    <div>
                      <h3 className="font-medium">{session.title}</h3>
                      <p className="text-sm text-muted-foreground">
                        {session.description || 'No description'}
                      </p>
                      <div className="mt-1 flex items-center gap-4 text-xs text-muted-foreground">
                        <span>
                          Project: {session.category?.name || 'General'}
                        </span>
                        <span>
                          Date:{' '}
                          {new Date(session.start_time).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <Badge variant="secondary">
                      {session.category?.name || 'General'}
                    </Badge>
                    <div className="text-right">
                      <div className="font-semibold">
                        {session.duration_seconds
                          ? formatDuration(session.duration_seconds)
                          : 'In progress'}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {session.start_time
                          ? new Date(session.start_time).toLocaleTimeString(
                              [],
                              { hour: '2-digit', minute: '2-digit' }
                            )
                          : ''}
                        {session.end_time && session.start_time
                          ? ` - ${new Date(session.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                          : ''}
                      </div>
                    </div>
                    <Button variant="outline" size="sm">
                      <Eye className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Pagination */}
          {filteredSessions.length > 10 && (
            <div className="mt-6 flex items-center justify-between border-t pt-6">
              <div className="text-sm text-muted-foreground">
                Showing 1-10 of {filteredSessions.length} entries
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm">
                  Previous
                </Button>
                <Button variant="outline" size="sm">
                  1
                </Button>
                <Button variant="outline" size="sm">
                  2
                </Button>
                <Button variant="outline" size="sm">
                  3
                </Button>
                <Button variant="outline" size="sm">
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
          <CardDescription>
            Common actions for managing your time history
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Button
              variant="outline"
              className="flex h-20 flex-col items-center justify-center gap-2"
            >
              <Download className="h-6 w-6" />
              <span>Export History</span>
            </Button>
            <Button
              variant="outline"
              className="flex h-20 flex-col items-center justify-center gap-2"
            >
              <Calendar className="h-6 w-6" />
              <span>View Calendar</span>
            </Button>
            <Button
              variant="outline"
              className="flex h-20 flex-col items-center justify-center gap-2"
            >
              <Clock className="h-6 w-6" />
              <span>Start New Timer</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
