'use client';

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
import {
  Bell,
  Clock,
  Edit,
  Eye,
  FolderOpen,
  Pause,
  Play,
  Search,
  Target,
} from 'lucide-react';
import { useState } from 'react';

interface Session {
  id: number;
  user: string;
  category: string;
  goal: string;
  status: 'active' | 'paused' | 'completed';
  todayHours: number;
  weeklyHours: number;
  completionStatus: 'on-track' | 'behind' | 'ahead';
  avatar?: string;
  logs: {
    date: string;
    task: string;
    startTime: string;
    endTime: string;
    duration: number;
  }[];
}

const sessions: Session[] = [
  {
    id: 1,
    user: 'Alice Johnson',
    category: 'Development',
    goal: 'Complete API Integration',
    status: 'active',
    todayHours: 5.5,
    weeklyHours: 32.5,
    completionStatus: 'on-track',
    logs: [
      {
        date: '2025-01-03',
        task: 'API Endpoint Setup',
        startTime: '09:00',
        endTime: '12:30',
        duration: 3.5,
      },
      {
        date: '2025-01-03',
        task: 'Authentication Flow',
        startTime: '13:30',
        endTime: '15:30',
        duration: 2.0,
      },
      {
        date: '2025-01-02',
        task: 'Documentation Review',
        startTime: '10:00',
        endTime: '11:00',
        duration: 1.0,
      },
    ],
  },
  {
    id: 2,
    user: 'Bob Williams',
    category: 'Design',
    goal: 'UI Component Library',
    status: 'paused',
    todayHours: 2.5,
    weeklyHours: 18.5,
    completionStatus: 'behind',
    logs: [
      {
        date: '2025-01-03',
        task: 'Component Design System',
        startTime: '09:00',
        endTime: '11:30',
        duration: 2.5,
      },
    ],
  },
  {
    id: 3,
    user: 'Charlie Brown',
    category: 'Testing',
    goal: 'Quality Assurance Sprint',
    status: 'active',
    todayHours: 7.2,
    weeklyHours: 40.0,
    completionStatus: 'ahead',
    logs: [
      {
        date: '2025-01-03',
        task: 'Automated Testing Setup',
        startTime: '08:30',
        endTime: '17:00',
        duration: 7.2,
      },
    ],
  },
  {
    id: 4,
    user: 'Diana Miller',
    category: 'Research',
    goal: 'Market Analysis',
    status: 'completed',
    todayHours: 4.0,
    weeklyHours: 28.0,
    completionStatus: 'on-track',
    logs: [
      {
        date: '2025-01-03',
        task: 'Competitor Analysis',
        startTime: '09:00',
        endTime: '13:00',
        duration: 4.0,
      },
    ],
  },
  {
    id: 5,
    user: 'Ethan Garcia',
    category: 'Development',
    goal: 'Database Migration',
    status: 'paused',
    todayHours: 3.5,
    weeklyHours: 25.5,
    completionStatus: 'behind',
    logs: [
      {
        date: '2025-01-03',
        task: 'Schema Updates',
        startTime: '10:00',
        endTime: '13:30',
        duration: 3.5,
      },
    ],
  },
];

export default function TimeTrackerManagementClient() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const filteredSessions = sessions.filter(
    (session) =>
      session.user.toLowerCase().includes(searchQuery.toLowerCase()) ||
      session.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
      session.goal.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalSessions = sessions.length;
  const activeSessions = sessions.filter((s) => s.status === 'active').length;
  const totalHoursToday = sessions.reduce((sum, s) => sum + s.todayHours, 0);
  const behindSchedule = sessions.filter(
    (s) => s.completionStatus === 'behind'
  ).length;

  const getStatusColor = (status: Session['status']) => {
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

  const getCompletionColor = (status: Session['completionStatus']) => {
    switch (status) {
      case 'on-track':
        return 'bg-dynamic-blue/10 text-dynamic-blue';
      case 'behind':
        return 'bg-dynamic-red/10 text-dynamic-red';
      case 'ahead':
        return 'bg-dynamic-green/10 text-dynamic-green';
      default:
        return 'bg-dynamic-gray/10 text-dynamic-gray';
    }
  };

  const getStatusIcon = (status: Session['status']) => {
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

  const handleViewDetails = (session: Session) => {
    setSelectedSession(session);
    setIsModalOpen(true);
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between border-dynamic-border/20 border-b bg-background p-4">
        <div className="relative w-full max-w-sm">
          <Search className="-translate-y-1/2 absolute top-1/2 left-3 size-4 transform text-dynamic-muted" />
          <Input
            placeholder="Search sessions, categories, or goals..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="border-dynamic-border/20 bg-dynamic-muted/5 pl-10"
          />
        </div>
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            className="text-dynamic-muted hover:text-dynamic-foreground"
          >
            <Bell className="size-4" />
          </Button>
          <div className="flex items-center gap-3">
            <Avatar className="size-8">
              <AvatarImage src="https://i.pravatar.cc/40?u=admin" alt="Admin" />
              <AvatarFallback>AD</AvatarFallback>
            </Avatar>
            <div className="hidden sm:block">
              <h3 className="font-semibold text-dynamic-foreground text-sm">
                Admin User
              </h3>
              <p className="text-dynamic-muted text-xs">System Administrator</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto bg-dynamic-background p-6">
        <div className="container mx-auto max-w-7xl">
          <h2 className="mb-6 font-bold text-3xl text-dynamic-foreground">
            Time Tracker Dashboard
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
                  {totalHoursToday.toFixed(1)}h
                </div>
              </CardContent>
            </Card>

            <Card className="border-dynamic-red/20 bg-dynamic-red/5">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="font-medium text-dynamic-muted text-sm">
                  Behind Schedule
                </CardTitle>
                <FolderOpen className="size-4 text-dynamic-red" />
              </CardHeader>
              <CardContent>
                <div className="font-bold text-2xl text-dynamic-red">
                  {behindSchedule}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Sessions Table */}
          <Card className="border-dynamic-border/20 bg-background">
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
                      Status
                    </TableHead>
                    <TableHead className="hidden font-semibold text-dynamic-muted lg:table-cell">
                      Category
                    </TableHead>
                    <TableHead className="font-semibold text-dynamic-muted">
                      Goal
                    </TableHead>
                    <TableHead className="font-semibold text-dynamic-muted">
                      Today's Hours
                    </TableHead>
                    <TableHead className="hidden font-semibold text-dynamic-muted md:table-cell">
                      Weekly Hours
                    </TableHead>
                    <TableHead className="font-semibold text-dynamic-muted">
                      Progress
                    </TableHead>
                    <TableHead className="font-semibold text-dynamic-muted">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSessions.map((session) => (
                    <TableRow
                      key={session.id}
                      className="hover:bg-dynamic-muted/3"
                    >
                      <TableCell className="py-4">
                        <div className="flex items-center gap-3">
                          <Avatar className="size-10">
                            <AvatarImage
                              src={`https://i.pravatar.cc/40?u=${session.id}`}
                              alt={session.user}
                            />
                            <AvatarFallback>
                              {session.user
                                .split(' ')
                                .map((n) => n[0])
                                .join('')}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-semibold text-dynamic-foreground">
                              {session.user}
                            </p>
                            <p className="hidden text-dynamic-muted text-sm sm:block">
                              {session.user.toLowerCase().replace(' ', '.')}
                              @company.com
                            </p>
                          </div>
                        </div>
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
                      <TableCell className="hidden lg:table-cell">
                        <span className="text-dynamic-foreground text-sm">
                          {session.category}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-dynamic-foreground text-sm">
                          {session.goal}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="font-medium text-dynamic-foreground">
                          {session.todayHours.toFixed(1)}h
                        </span>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <span className="font-medium text-dynamic-foreground">
                          {session.weeklyHours.toFixed(1)}h
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={getCompletionColor(
                            session.completionStatus
                          )}
                        >
                          {session.completionStatus.replace('-', ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 text-dynamic-blue hover:bg-dynamic-blue/10 hover:text-dynamic-blue"
                            onClick={() => handleViewDetails(session)}
                          >
                            <Eye className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 text-dynamic-muted hover:bg-dynamic-muted/10 hover:text-dynamic-foreground"
                          >
                            <Edit className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 text-dynamic-red hover:bg-dynamic-red/10 hover:text-dynamic-red"
                          >
                            <Bell className="size-4" />
                          </Button>
                        </div>
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
      </main>

      {/* Session Details Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-dynamic-foreground">
              {selectedSession?.user} - Session Details
            </DialogTitle>
          </DialogHeader>

          {selectedSession && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4 rounded-lg bg-dynamic-muted/5 p-4">
                <div>
                  <p className="text-dynamic-muted text-sm">Category</p>
                  <p className="font-medium text-dynamic-foreground">
                    {selectedSession.category}
                  </p>
                </div>
                <div>
                  <p className="text-dynamic-muted text-sm">Goal</p>
                  <p className="font-medium text-dynamic-foreground">
                    {selectedSession.goal}
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
                <div>
                  <p className="text-dynamic-muted text-sm">Progress</p>
                  <Badge
                    variant="secondary"
                    className={getCompletionColor(
                      selectedSession.completionStatus
                    )}
                  >
                    {selectedSession.completionStatus.replace('-', ' ')}
                  </Badge>
                </div>
              </div>

              <div>
                <h4 className="mb-3 font-semibold text-dynamic-foreground">
                  Recent Time Logs
                </h4>
                <div className="overflow-hidden rounded-lg border border-dynamic-border/20">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-dynamic-muted/5">
                        <TableHead className="text-dynamic-muted">
                          Date
                        </TableHead>
                        <TableHead className="text-dynamic-muted">
                          Task
                        </TableHead>
                        <TableHead className="text-dynamic-muted">
                          Time
                        </TableHead>
                        <TableHead className="text-dynamic-muted">
                          Duration
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedSession.logs.map((log) => (
                        <TableRow
                          key={`${log.date}-${log.startTime}`}
                          className="hover:bg-dynamic-muted/3"
                        >
                          <TableCell className="text-dynamic-muted">
                            {log.date}
                          </TableCell>
                          <TableCell className="text-dynamic-foreground">
                            {log.task}
                          </TableCell>
                          <TableCell className="text-dynamic-muted">
                            {log.startTime} - {log.endTime}
                          </TableCell>
                          <TableCell className="font-medium text-dynamic-foreground">
                            {log.duration.toFixed(1)}h
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
