'use client';

import type { TimeTrackingSession } from '@tuturuuu/types/db';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Input } from '@tuturuuu/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@tuturuuu/ui/table';
import { cn } from '@tuturuuu/utils/format';
import dayjs from 'dayjs';
import duration from 'dayjs/plugin/duration';
import { Clock, Eye, Pause, Play, Search, Target } from 'lucide-react';
import { useState } from 'react';

// Extend dayjs with duration plugin
dayjs.extend(duration);

interface GroupedSession {
  title: string;
  category: {
    name: string;
    color: string;
  } | null;
  sessions: TimeTrackingSession[]; // All sessions in this stack
  totalDuration: number; // Sum of all durations
  firstStartTime: string; // Earliest start time (dd/mm/yyyy HH:mm:ss)
  lastEndTime: string | null; // Latest end time (dd/mm/yyyy HH:mm:ss)
  status: 'active' | 'paused' | 'completed';
  user: {
    displayName: string | null;
    avatarUrl: string | null;
  };
}

const CATEGORY_COLORS = [
  { value: 'BLUE', label: 'Blue', class: 'bg-blue-500' },
  { value: 'GREEN', label: 'Green', class: 'bg-green-500' },
  { value: 'RED', label: 'Red', class: 'bg-red-500' },
  { value: 'YELLOW', label: 'Yellow', class: 'bg-yellow-500' },
  { value: 'ORANGE', label: 'Orange', class: 'bg-orange-500' },
  { value: 'PURPLE', label: 'Purple', class: 'bg-purple-500' },
  { value: 'PINK', label: 'Pink', class: 'bg-pink-500' },
  { value: 'INDIGO', label: 'Indigo', class: 'bg-indigo-500' },
  { value: 'CYAN', label: 'Cyan', class: 'bg-cyan-500' },
  { value: 'GRAY', label: 'Gray', class: 'bg-gray-500' },
];

// Helper function to format duration in HH:MM:SS
const formatDuration = (seconds: number) => {
  const dur = dayjs.duration(seconds, 'seconds');
  const hours = Math.floor(dur.asHours());
  const minutes = dur.minutes();
  const secs = dur.seconds();
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

// Helper function to format time
const formatTime = (timeString: string) => {
  return dayjs(timeString).format('DD/MM/YYYY, HH:mm:ss');
};

const getCategoryColor = (color: string) => {
  const colorConfig = CATEGORY_COLORS.find((c) => c.value === color);
  return colorConfig?.class || 'bg-blue-500';
};

export default function TimeTrackerManagementClient({
  groupedSessions,
}: {
  groupedSessions: GroupedSession[];
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSession, setSelectedSession] = useState<GroupedSession | null>(
    null
  );
  const [isModalOpen, setIsModalOpen] = useState(false);

  const filteredSessions = groupedSessions.filter((session) => {
    const userNameMatch =
      session.user.displayName
        ?.toLowerCase()
        .includes(searchQuery.toLowerCase()) ?? false;
    const categoryNameMatch =
      session.category?.name
        .toLowerCase()
        .includes(searchQuery.toLowerCase()) ?? false;
    const titleMatch = session.title
      .toLowerCase()
      .includes(searchQuery.toLowerCase());
    return userNameMatch || categoryNameMatch || titleMatch;
  });

  const totalSessions = groupedSessions.length;
  const activeSessions = groupedSessions.filter(
    (s) => s.status === 'active'
  ).length;
  const totalSecondsToday = groupedSessions.reduce(
    (sum, s) => sum + s.totalDuration,
    0
  );

  const getStatusColor = (status: 'active' | 'paused' | 'completed') => {
    switch (status) {
      case 'active':
        return 'bg-dynamic-green/20 text-dynamic-green border-dynamic-green/30';
      case 'paused':
        return 'bg-dynamic-yellow/20 text-dynamic-yellow border-dynamic-yellow/30';
      case 'completed':
        return 'bg-dynamic-blue/20 text-dynamic-blue border-dynamic-blue/30';
      default:
        return 'bg-dynamic-gray/20 text-dynamic-gray border-dynamic-gray/30';
    }
  };

  const getStatusIcon = (status: 'active' | 'paused' | 'completed') => {
    switch (status) {
      case 'active':
        return <Play className="size-3" />;
      case 'paused':
        return <Pause className="size-3" />;
      case 'completed':
        return <Clock className="size-3" />;
      default:
        return <Clock className="size-3" />;
    }
  };

  const handleViewDetails = (session: GroupedSession) => {
    setSelectedSession(session);
    setIsModalOpen(true);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="space-y-4 border-dynamic-border/20 border-b">
        <h2 className="mb-6 font-semibold text-2xl text-dynamic-foreground">
          Time Tracker Management
        </h2>

        {/* Stats Cards */}
        <div className="mb-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="border-dynamic-blue/20 bg-dynamic-blue/5">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="font-medium text-dynamic-muted text-sm">
                Total Sessions
              </CardTitle>
              <Clock className="size-4 text-dynamic-blue" />
            </CardHeader>
            <CardContent>
              <div className="font-bold text-2xl text-dynamic-blue">
                {totalSessions}
              </div>
            </CardContent>
          </Card>

          <Card className="border-dynamic-green/20 bg-dynamic-green/5">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="font-medium text-dynamic-muted text-sm">
                Active Today
              </CardTitle>
              <Play className="size-4 text-dynamic-green" />
            </CardHeader>
            <CardContent>
              <div className="font-bold text-2xl text-dynamic-green">
                {activeSessions}
              </div>
            </CardContent>
          </Card>

          <Card className="border-dynamic-yellow/20 bg-dynamic-yellow/5">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="font-medium text-dynamic-muted text-sm">
                Hours Today
              </CardTitle>
              <Target className="size-4 text-dynamic-yellow" />
            </CardHeader>
            <CardContent>
              <div className="font-bold text-2xl text-dynamic-yellow">
                {formatDuration(totalSecondsToday)}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Main content */}
      <div>
        <div className="space-y-4">
          <div className="relative w-full max-w-sm">
            <Search className="-translate-y-1/2 absolute top-1/2 left-3 size-4 transform text-dynamic-muted" />
            <Input
              placeholder="Search sessions, categories, or goals..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="border-dynamic-border/20 bg-dynamic-muted/5 pl-10"
            />
          </div>

          {/* Sessions Table */}
          <Card className="border-dynamic-border/20">
            <CardHeader className="border-dynamic-border/10 border-b">
              <CardTitle className="text-dynamic-foreground text-xl">
                All Sessions
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-dynamic-muted/5 hover:bg-dynamic-muted/5">
                    <TableHead className="font-semibold text-dynamic-muted">
                      User
                    </TableHead>
                    <TableHead className="font-semibold text-dynamic-muted">
                      Title
                    </TableHead>
                    <TableHead className="font-semibold text-dynamic-muted">
                      Category
                    </TableHead>
                    <TableHead className="font-semibold text-dynamic-muted">
                      Duration
                    </TableHead>
                    <TableHead className="font-semibold text-dynamic-muted">
                      Start Time
                    </TableHead>
                    <TableHead className="font-semibold text-dynamic-muted">
                      End Time
                    </TableHead>
                    <TableHead className="font-semibold text-dynamic-muted">
                      Status
                    </TableHead>
                    <TableHead className="font-semibold text-dynamic-muted">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSessions.map((session, index) => (
                    <TableRow
                      // biome-ignore lint: false positive
                      key={`grouped-session-${index}`}
                      className="hover:bg-dynamic-muted/3"
                    >
                      <TableCell className="py-4">
                        <div className="flex items-center gap-3">
                          <Avatar className="size-10">
                            <AvatarImage
                              src={
                                session.user.avatarUrl ||
                                `https://i.pravatar.cc/40?u=${session.user.displayName}`
                              }
                              alt={session.user.displayName || 'User'}
                            />
                            <AvatarFallback>
                              {session.user.displayName
                                ?.split(' ')
                                .map((n: string) => n[0])
                                .join('') || 'U'}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-semibold text-dynamic-foreground">
                              {session.user.displayName}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="font-medium text-dynamic-foreground">
                          {session.title}
                        </span>
                      </TableCell>
                      <TableCell>
                        {session.category ? (
                          <div className="flex items-center gap-2">
                            <div
                              className={cn(
                                'size-2 rounded-full',
                                getCategoryColor(session.category.color)
                              )}
                            />
                            <span className="text-dynamic-foreground text-sm">
                              {session.category.name}
                            </span>
                          </div>
                        ) : (
                          <span className="text-dynamic-muted text-sm">
                            No category
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="font-medium text-dynamic-foreground">
                          {formatDuration(session.totalDuration)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="font-medium text-dynamic-foreground">
                          {formatTime(session.firstStartTime)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="font-medium text-dynamic-foreground">
                          {session.lastEndTime
                            ? formatTime(session.lastEndTime)
                            : '-'}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={getStatusColor(session.status)}
                        >
                          {getStatusIcon(session.status)}
                          {session.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 text-dynamic-blue hover:bg-dynamic-blue/10 hover:text-dynamic-blue"
                          onClick={() => handleViewDetails(session)}
                        >
                          <Eye className="size-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {filteredSessions.length === 0 && (
                <div className="p-8 text-center text-dynamic-muted">
                  <p>No sessions found matching your search criteria.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Session Details Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-h-[90vh] sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle className="text-dynamic-foreground">
              {selectedSession?.user.displayName} - {selectedSession?.title}
            </DialogTitle>
          </DialogHeader>

          {selectedSession && (
            <div className="space-y-6">
              <div className="grid grid-cols-3 gap-4 rounded-lg bg-dynamic-muted/5 p-4">
                <div>
                  <p className="text-dynamic-muted text-sm">Category</p>
                  <div className="flex items-center gap-2">
                    {selectedSession.category && (
                      <>
                        <div
                          className={cn(
                            'size-2 rounded-full',
                            getCategoryColor(selectedSession.category.color)
                          )}
                        />
                        <span className="font-medium text-dynamic-foreground">
                          {selectedSession.category.name}
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <div>
                  <p className="text-dynamic-muted text-sm">Total Duration</p>
                  <p className="font-medium font-mono text-dynamic-foreground">
                    {formatDuration(selectedSession.totalDuration)}
                  </p>
                </div>
                <div>
                  <p className="text-dynamic-muted text-sm">Status</p>
                  <Badge
                    variant="outline"
                    className={getStatusColor(selectedSession.status)}
                  >
                    {getStatusIcon(selectedSession.status)}
                    {selectedSession.status}
                  </Badge>
                </div>
              </div>

              <div>
                <h4 className="mb-3 font-semibold text-dynamic-foreground">
                  Individual Sessions ({selectedSession.sessions.length})
                </h4>
                <div className="overflow-hidden rounded-lg border border-dynamic-border/20">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-dynamic-muted/5">
                        <TableHead className="text-dynamic-muted">
                          Title
                        </TableHead>
                        <TableHead className="text-dynamic-muted">
                          Description
                        </TableHead>
                        <TableHead className="text-dynamic-muted">
                          Start Time
                        </TableHead>
                        <TableHead className="text-dynamic-muted">
                          End Time
                        </TableHead>
                        <TableHead className="text-dynamic-muted">
                          Duration
                        </TableHead>
                        <TableHead className="text-dynamic-muted">
                          Score
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedSession.sessions.map((session) => (
                        <TableRow
                          key={session.id}
                          className="hover:bg-dynamic-muted/3"
                        >
                          <TableCell className="font-medium text-dynamic-foreground">
                            {session.title}
                          </TableCell>
                          <TableCell className="text-dynamic-muted">
                            {session.description || '-'}
                          </TableCell>
                          <TableCell className="text-dynamic-muted">
                            {formatTime(session.start_time)}
                          </TableCell>
                          <TableCell className="text-dynamic-muted">
                            {session.end_time
                              ? formatTime(session.end_time)
                              : '-'}
                          </TableCell>
                          <TableCell className="font-medium font-mono text-dynamic-foreground">
                            {session.duration_seconds
                              ? formatDuration(session.duration_seconds)
                              : '-'}
                          </TableCell>
                          <TableCell className="text-dynamic-foreground">
                            {session.productivity_score
                              ? `${session.productivity_score}%`
                              : '-'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
