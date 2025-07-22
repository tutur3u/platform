'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
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
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from '@tuturuuu/ui/chart';
import { Input } from '@tuturuuu/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Separator } from '@tuturuuu/ui/separator';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@tuturuuu/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import {
  Activity,
  AlertCircle,
  BarChart3,
  Building2,
  Calendar,
  CalendarDays,
  CheckCircle2,
  Clock,
  Download,
  Edit,
  Filter,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  TrendingUp,
  Zap,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from 'recharts';

// Mock data for workspaces
const workspaces = [
  { id: 'ws_1', name: 'Marketing Team', color: 'bg-blue-500' },
  { id: 'ws_2', name: 'Engineering', color: 'bg-green-500' },
  { id: 'ws_3', name: 'Sales Department', color: 'bg-purple-500' },
  { id: 'ws_4', name: 'Executive Team', color: 'bg-orange-500' },
];

// Mock data for sync logs with workspace context
const syncLogs = [
  {
    id: 'sync_001',
    timestamp: '2024-01-19T14:30:00Z',
    type: 'active',
    workspace: workspaces[0],
    triggeredBy: {
      id: 'user_1',
      name: 'Sarah Chen',
      email: 'sarah@company.com',
      avatar: '/placeholder.svg?height=32&width=32',
    },
    status: 'completed',
    duration: 2340,
    events: {
      added: 15,
      updated: 8,
      deleted: 2,
    },
    calendarSource: 'Google Calendar',
  },
  {
    id: 'sync_002',
    timestamp: '2024-01-19T14:00:00Z',
    type: 'background',
    workspace: workspaces[1],
    triggeredBy: null,
    status: 'completed',
    duration: 1890,
    events: {
      added: 3,
      updated: 12,
      deleted: 0,
    },
    calendarSource: 'Outlook Calendar',
  },
  {
    id: 'sync_003',
    timestamp: '2024-01-19T13:45:00Z',
    type: 'active',
    workspace: workspaces[0],
    triggeredBy: {
      id: 'user_2',
      name: 'Mike Johnson',
      email: 'mike@company.com',
      avatar: '/placeholder.svg?height=32&width=32',
    },
    status: 'failed',
    duration: 890,
    events: {
      added: 0,
      updated: 0,
      deleted: 0,
    },
    calendarSource: 'Google Calendar',
    error: 'Authentication failed',
  },
  {
    id: 'sync_004',
    timestamp: '2024-01-19T13:30:00Z',
    type: 'background',
    workspace: workspaces[2],
    triggeredBy: null,
    status: 'completed',
    duration: 3200,
    events: {
      added: 22,
      updated: 15,
      deleted: 5,
    },
    calendarSource: 'Apple Calendar',
  },
  {
    id: 'sync_005',
    timestamp: '2024-01-19T13:15:00Z',
    type: 'active',
    workspace: workspaces[1],
    triggeredBy: {
      id: 'user_3',
      name: 'Emma Davis',
      email: 'emma@company.com',
      avatar: '/placeholder.svg?height=32&width=32',
    },
    status: 'running',
    duration: 1560,
    events: {
      added: 7,
      updated: 4,
      deleted: 1,
    },
    calendarSource: 'Google Calendar',
  },
  {
    id: 'sync_006',
    timestamp: '2024-01-19T13:00:00Z',
    type: 'background',
    workspace: workspaces[3],
    triggeredBy: null,
    status: 'completed',
    duration: 2100,
    events: {
      added: 9,
      updated: 18,
      deleted: 3,
    },
    calendarSource: 'Outlook Calendar',
  },
];

// Generate mock time series data for charts
const generateTimeSeriesData = () => {
  const data = [];
  const now = new Date();

  for (let i = 23; i >= 0; i--) {
    const time = new Date(now.getTime() - i * 60 * 60 * 1000);
    const hour = time.getHours();

    // Simulate realistic sync patterns (more activity during business hours)
    const baseActivity = hour >= 9 && hour <= 17 ? 3 : 1;
    const variance = Math.random() * 2;

    data.push({
      time: time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      syncs: Math.floor(baseActivity + variance),
      success: Math.floor((baseActivity + variance) * 0.85),
      failed: Math.floor((baseActivity + variance) * 0.15),
      events: Math.floor((baseActivity + variance) * 12),
      duration: 1500 + Math.random() * 1000,
    });
  }

  return data;
};

const timeSeriesData = generateTimeSeriesData();

// Workspace activity data
const workspaceActivityData = workspaces.map((workspace) => {
  const workspaceLogs = syncLogs.filter(
    (log) => log.workspace?.id === workspace.id
  );
  const totalEvents = workspaceLogs.reduce(
    (sum, log) =>
      sum + log.events.added + log.events.updated + log.events.deleted,
    0
  );

  return {
    name: workspace.name,
    syncs: workspaceLogs.length,
    events: totalEvents,
    success: workspaceLogs.filter((log) => log.status === 'completed').length,
    color: workspace.color.replace('bg-', ''),
  };
});

// Calendar source distribution
const calendarSourceData = [
  { name: 'Google Calendar', value: 45, color: '#4285f4' },
  { name: 'Outlook Calendar', value: 35, color: '#0078d4' },
  { name: 'Apple Calendar', value: 20, color: '#007aff' },
];

// Event type distribution over time
const eventTypeData = [
  { period: '00:00', added: 12, updated: 8, deleted: 3 },
  { period: '04:00', added: 5, updated: 3, deleted: 1 },
  { period: '08:00', added: 25, updated: 15, deleted: 4 },
  { period: '12:00', added: 35, updated: 22, deleted: 6 },
  { period: '16:00', added: 28, updated: 18, deleted: 5 },
  { period: '20:00', added: 15, updated: 10, deleted: 2 },
];

export function CalendarSyncDashboard() {
  const [filterType, setFilterType] = useState('all');
  const [filterWorkspace, setFilterWorkspace] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  const filteredLogs = useMemo(() => {
    return syncLogs.filter((log) => {
      const matchesType = filterType === 'all' || log.type === filterType;
      const matchesWorkspace =
        filterWorkspace === 'all' || log.workspace?.id === filterWorkspace;
      const matchesSearch =
        searchTerm === '' ||
        log.triggeredBy?.name
          .toLowerCase()
          .includes(searchTerm.toLowerCase()) ||
        log.triggeredBy?.email
          .toLowerCase()
          .includes(searchTerm.toLowerCase()) ||
        log.workspace?.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.calendarSource.toLowerCase().includes(searchTerm.toLowerCase());
      return matchesType && matchesWorkspace && matchesSearch;
    });
  }, [filterType, filterWorkspace, searchTerm]);

  const totalEvents = useMemo(() => {
    return syncLogs.reduce(
      (acc, log) => ({
        added: acc.added + log.events.added,
        updated: acc.updated + log.events.updated,
        deleted: acc.deleted + log.events.deleted,
      }),
      { added: 0, updated: 0, deleted: 0 }
    );
  }, []);

  const completedSyncs = useMemo(() => {
    return syncLogs.filter((log) => log.status === 'completed').length;
  }, []);

  const failedSyncs = useMemo(() => {
    return syncLogs.filter((log) => log.status === 'failed').length;
  }, []);

  const successRate = useMemo(() => {
    return ((completedSyncs / syncLogs.length) * 100).toFixed(1);
  }, [completedSyncs]);

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return (
      date.toLocaleDateString() +
      ' ' +
      date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    );
  };

  const formatDuration = (ms: number) => {
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const getStatusBadge = (status: string, error?: string) => {
    switch (status) {
      case 'completed':
        return (
          <Badge
            variant="outline"
            className="border-green-200 bg-green-50 font-medium text-green-700"
          >
            <CheckCircle2 className="mr-1 h-3 w-3" />
            Completed
          </Badge>
        );
      case 'failed':
        return (
          <Badge
            variant="outline"
            className="border-red-200 bg-red-50 font-medium text-red-700"
          >
            <AlertCircle className="mr-1 h-3 w-3" />
            Failed
          </Badge>
        );
      case 'running':
        return (
          <Badge
            variant="outline"
            className="border-blue-200 bg-blue-50 font-medium text-blue-700"
          >
            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            Running
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getTypeBadge = (type: string) => {
    return type === 'active' ? (
      <Badge
        variant="outline"
        className="border-purple-200 bg-purple-50 font-medium text-purple-700"
      >
        <Zap className="mr-1 h-3 w-3" />
        Manual
      </Badge>
    ) : (
      <Badge
        variant="outline"
        className="border-slate-200 bg-slate-50 font-medium text-slate-700"
      >
        <Clock className="mr-1 h-3 w-3" />
        Auto
      </Badge>
    );
  };

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-slate-50 to-slate-100/50">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b bg-white/80 backdrop-blur-sm">
        <div className="flex h-16 items-center px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-blue-600">
              <Calendar className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-slate-900">
                Calendar Sync Dashboard
              </h1>
              <p className="text-sm text-slate-500">
                Monitor workspace calendar synchronization
              </p>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              className="gap-2 bg-transparent"
            >
              <Download className="h-4 w-4" />
              Export
            </Button>
            <Button size="sm" className="gap-2 bg-blue-600 hover:bg-blue-700">
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 p-6">
        <div className="mx-auto max-w-7xl space-y-8">
          {/* Summary Cards */}
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            <Card className="border-0 bg-white/60 shadow-sm backdrop-blur-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                <CardTitle className="text-sm font-medium text-slate-600">
                  Total Syncs
                </CardTitle>
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100">
                  <Activity className="h-4 w-4 text-blue-600" />
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="text-3xl font-bold text-slate-900">
                  {syncLogs.length}
                </div>
                <div className="mt-2 flex items-center gap-4 text-xs">
                  <span className="font-medium text-green-600">
                    {successRate}% success
                  </span>
                  {failedSyncs > 0 && (
                    <span className="font-medium text-red-600">
                      {failedSyncs} failed
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 bg-white/60 shadow-sm backdrop-blur-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                <CardTitle className="text-sm font-medium text-slate-600">
                  Events Added
                </CardTitle>
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-100">
                  <Plus className="h-4 w-4 text-green-600" />
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="text-3xl font-bold text-green-600">
                  {totalEvents.added}
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  New calendar events
                </p>
              </CardContent>
            </Card>

            <Card className="border-0 bg-white/60 shadow-sm backdrop-blur-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                <CardTitle className="text-sm font-medium text-slate-600">
                  Events Updated
                </CardTitle>
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100">
                  <Edit className="h-4 w-4 text-blue-600" />
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="text-3xl font-bold text-blue-600">
                  {totalEvents.updated}
                </div>
                <p className="mt-2 text-xs text-slate-500">Modified events</p>
              </CardContent>
            </Card>

            <Card className="border-0 bg-white/60 shadow-sm backdrop-blur-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                <CardTitle className="text-sm font-medium text-slate-600">
                  Events Deleted
                </CardTitle>
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-100">
                  <Trash2 className="h-4 w-4 text-red-600" />
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="text-3xl font-bold text-red-600">
                  {totalEvents.deleted}
                </div>
                <p className="mt-2 text-xs text-slate-500">Removed events</p>
              </CardContent>
            </Card>
          </div>

          {/* Analytics Charts */}
          <Card className="border-0 bg-white/60 shadow-sm backdrop-blur-sm">
            <CardHeader>
              <div className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-blue-600" />
                <CardTitle className="text-xl text-slate-900">
                  Analytics & Insights
                </CardTitle>
              </div>
              <CardDescription className="text-slate-500">
                Comprehensive sync performance and trend analysis
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="overview" className="space-y-6">
                <TabsList className="grid w-full grid-cols-4 bg-slate-100/80">
                  <TabsTrigger
                    value="overview"
                    className="data-[state=active]:bg-white"
                  >
                    Overview
                  </TabsTrigger>
                  <TabsTrigger
                    value="performance"
                    className="data-[state=active]:bg-white"
                  >
                    Performance
                  </TabsTrigger>
                  <TabsTrigger
                    value="workspaces"
                    className="data-[state=active]:bg-white"
                  >
                    Workspaces
                  </TabsTrigger>
                  <TabsTrigger
                    value="sources"
                    className="data-[state=active]:bg-white"
                  >
                    Sources
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="overview" className="space-y-6">
                  <div className="grid gap-6 lg:grid-cols-2">
                    <Card className="border border-slate-200">
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-lg">
                          <TrendingUp className="h-4 w-4 text-blue-600" />
                          Sync Activity (24h)
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ChartContainer
                          config={{
                            syncs: {
                              label: 'Total Syncs',
                              color: 'hsl(var(--chart-1))',
                            },
                            success: {
                              label: 'Successful',
                              color: 'hsl(var(--chart-2))',
                            },
                          }}
                          className="h-[300px]"
                        >
                          <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={timeSeriesData}>
                              <CartesianGrid
                                strokeDasharray="3 3"
                                className="stroke-slate-200"
                              />
                              <XAxis dataKey="time" className="text-xs" />
                              <YAxis className="text-xs" />
                              <ChartTooltip content={<ChartTooltipContent />} />
                              <Area
                                type="monotone"
                                dataKey="syncs"
                                stackId="1"
                                stroke="var(--color-syncs)"
                                fill="var(--color-syncs)"
                                fillOpacity={0.6}
                              />
                              <Area
                                type="monotone"
                                dataKey="success"
                                stackId="2"
                                stroke="var(--color-success)"
                                fill="var(--color-success)"
                                fillOpacity={0.8}
                              />
                            </AreaChart>
                          </ResponsiveContainer>
                        </ChartContainer>
                      </CardContent>
                    </Card>

                    <Card className="border border-slate-200">
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-lg">
                          <Activity className="h-4 w-4 text-green-600" />
                          Event Changes Over Time
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ChartContainer
                          config={{
                            added: {
                              label: 'Added',
                              color: 'hsl(var(--chart-1))',
                            },
                            updated: {
                              label: 'Updated',
                              color: 'hsl(var(--chart-2))',
                            },
                            deleted: {
                              label: 'Deleted',
                              color: 'hsl(var(--chart-3))',
                            },
                          }}
                          className="h-[300px]"
                        >
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={eventTypeData}>
                              <CartesianGrid
                                strokeDasharray="3 3"
                                className="stroke-slate-200"
                              />
                              <XAxis dataKey="period" className="text-xs" />
                              <YAxis className="text-xs" />
                              <ChartTooltip content={<ChartTooltipContent />} />
                              <ChartLegend content={<ChartLegendContent />} />
                              <Bar
                                dataKey="added"
                                fill="var(--color-added)"
                                radius={[2, 2, 0, 0]}
                              />
                              <Bar
                                dataKey="updated"
                                fill="var(--color-updated)"
                                radius={[2, 2, 0, 0]}
                              />
                              <Bar
                                dataKey="deleted"
                                fill="var(--color-deleted)"
                                radius={[2, 2, 0, 0]}
                              />
                            </BarChart>
                          </ResponsiveContainer>
                        </ChartContainer>
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>

                <TabsContent value="performance" className="space-y-6">
                  <div className="grid gap-6 lg:grid-cols-2">
                    <Card className="border border-slate-200">
                      <CardHeader>
                        <CardTitle className="text-lg">
                          Sync Duration Trends
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ChartContainer
                          config={{
                            duration: {
                              label: 'Duration (ms)',
                              color: 'hsl(var(--chart-4))',
                            },
                          }}
                          className="h-[300px]"
                        >
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={timeSeriesData}>
                              <CartesianGrid
                                strokeDasharray="3 3"
                                className="stroke-slate-200"
                              />
                              <XAxis dataKey="time" className="text-xs" />
                              <YAxis className="text-xs" />
                              <ChartTooltip content={<ChartTooltipContent />} />
                              <Line
                                type="monotone"
                                dataKey="duration"
                                stroke="var(--color-duration)"
                                strokeWidth={2}
                                dot={{
                                  fill: 'var(--color-duration)',
                                  strokeWidth: 2,
                                  r: 4,
                                }}
                              />
                            </LineChart>
                          </ResponsiveContainer>
                        </ChartContainer>
                      </CardContent>
                    </Card>

                    <Card className="border border-slate-200">
                      <CardHeader>
                        <CardTitle className="text-lg">
                          Success Rate Trend
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ChartContainer
                          config={{
                            success: {
                              label: 'Success Rate',
                              color: 'hsl(var(--chart-2))',
                            },
                            failed: {
                              label: 'Failed',
                              color: 'hsl(var(--chart-5))',
                            },
                          }}
                          className="h-[300px]"
                        >
                          <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={timeSeriesData}>
                              <CartesianGrid
                                strokeDasharray="3 3"
                                className="stroke-slate-200"
                              />
                              <XAxis dataKey="time" className="text-xs" />
                              <YAxis className="text-xs" />
                              <ChartTooltip content={<ChartTooltipContent />} />
                              <Area
                                type="monotone"
                                dataKey="success"
                                stackId="1"
                                stroke="var(--color-success)"
                                fill="var(--color-success)"
                                fillOpacity={0.8}
                              />
                              <Area
                                type="monotone"
                                dataKey="failed"
                                stackId="1"
                                stroke="var(--color-failed)"
                                fill="var(--color-failed)"
                                fillOpacity={0.8}
                              />
                            </AreaChart>
                          </ResponsiveContainer>
                        </ChartContainer>
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>

                <TabsContent value="workspaces" className="space-y-6">
                  <Card className="border border-slate-200">
                    <CardHeader>
                      <CardTitle className="text-lg">
                        Workspace Activity Comparison
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ChartContainer
                        config={{
                          syncs: {
                            label: 'Syncs',
                            color: 'hsl(var(--chart-1))',
                          },
                          events: {
                            label: 'Events',
                            color: 'hsl(var(--chart-2))',
                          },
                        }}
                        className="h-[400px]"
                      >
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            data={workspaceActivityData}
                            layout="horizontal"
                          >
                            <CartesianGrid
                              strokeDasharray="3 3"
                              className="stroke-slate-200"
                            />
                            <XAxis type="number" className="text-xs" />
                            <YAxis
                              dataKey="name"
                              type="category"
                              className="text-xs"
                              width={120}
                            />
                            <ChartTooltip content={<ChartTooltipContent />} />
                            <ChartLegend content={<ChartLegendContent />} />
                            <Bar
                              dataKey="syncs"
                              fill="var(--color-syncs)"
                              radius={[0, 4, 4, 0]}
                            />
                            <Bar
                              dataKey="events"
                              fill="var(--color-events)"
                              radius={[0, 4, 4, 0]}
                            />
                          </BarChart>
                        </ResponsiveContainer>
                      </ChartContainer>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="sources" className="space-y-6">
                  <div className="grid gap-6 lg:grid-cols-2">
                    <Card className="border border-slate-200">
                      <CardHeader>
                        <CardTitle className="text-lg">
                          Calendar Source Distribution
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ChartContainer
                          config={{
                            google: {
                              label: 'Google Calendar',
                              color: '#4285f4',
                            },
                            outlook: {
                              label: 'Outlook Calendar',
                              color: '#0078d4',
                            },
                            apple: {
                              label: 'Apple Calendar',
                              color: '#007aff',
                            },
                          }}
                          className="h-[300px]"
                        >
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={calendarSourceData}
                                cx="50%"
                                cy="50%"
                                innerRadius={60}
                                outerRadius={120}
                                paddingAngle={5}
                                dataKey="value"
                              >
                                {calendarSourceData.map((entry, index) => (
                                  <Cell
                                    key={`cell-${index}`}
                                    fill={entry.color}
                                  />
                                ))}
                              </Pie>
                              <ChartTooltip content={<ChartTooltipContent />} />
                              <ChartLegend content={<ChartLegendContent />} />
                            </PieChart>
                          </ResponsiveContainer>
                        </ChartContainer>
                      </CardContent>
                    </Card>

                    <Card className="border border-slate-200">
                      <CardHeader>
                        <CardTitle className="text-lg">
                          Source Performance
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {calendarSourceData.map((source, index) => (
                          <div
                            key={index}
                            className="flex items-center justify-between rounded-lg bg-slate-50 p-3"
                          >
                            <div className="flex items-center gap-3">
                              <div
                                className="h-3 w-3 rounded-full"
                                style={{ backgroundColor: source.color }}
                              />
                              <span className="font-medium text-slate-700">
                                {source.name}
                              </span>
                            </div>
                            <div className="text-right">
                              <div className="text-lg font-bold text-slate-900">
                                {source.value}%
                              </div>
                              <div className="text-xs text-slate-500">
                                of total syncs
                              </div>
                            </div>
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          {/* Sync Logs Table */}
          <Card className="border-0 bg-white/60 shadow-sm backdrop-blur-sm">
            <CardHeader className="pb-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="text-xl text-slate-900">
                    Synchronization Activity
                  </CardTitle>
                  <CardDescription className="mt-1 text-slate-500">
                    Real-time calendar sync logs across all workspaces
                  </CardDescription>
                </div>
              </div>

              <Separator className="my-4" />

              {/* Filters */}
              <div className="flex flex-col gap-4 lg:flex-row">
                <div className="flex-1">
                  <div className="relative">
                    <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 transform text-slate-400" />
                    <Input
                      placeholder="Search by user, workspace, or calendar source..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="border-slate-200 bg-white/80 pl-10"
                    />
                  </div>
                </div>
                <div className="flex gap-3">
                  <Select
                    value={filterWorkspace}
                    onValueChange={setFilterWorkspace}
                  >
                    <SelectTrigger className="w-[180px] border-slate-200 bg-white/80">
                      <Building2 className="mr-2 h-4 w-4 text-slate-500" />
                      <SelectValue placeholder="All Workspaces" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Workspaces</SelectItem>
                      {workspaces.map((workspace) => (
                        <SelectItem key={workspace.id} value={workspace.id}>
                          <div className="flex items-center gap-2">
                            <div
                              className={`h-2 w-2 rounded-full ${workspace.color}`}
                            />
                            {workspace.name}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={filterType} onValueChange={setFilterType}>
                    <SelectTrigger className="w-[140px] border-slate-200 bg-white/80">
                      <Filter className="mr-2 h-4 w-4 text-slate-500" />
                      <SelectValue placeholder="All Types" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      <SelectItem value="active">Manual Sync</SelectItem>
                      <SelectItem value="background">Auto Sync</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>

            <CardContent className="pt-0">
              <div className="overflow-hidden rounded-lg border border-slate-200 bg-white/80">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50/80">
                      <TableHead className="font-semibold text-slate-700">
                        Time
                      </TableHead>
                      <TableHead className="font-semibold text-slate-700">
                        Workspace
                      </TableHead>
                      <TableHead className="font-semibold text-slate-700">
                        Type
                      </TableHead>
                      <TableHead className="font-semibold text-slate-700">
                        Triggered By
                      </TableHead>
                      <TableHead className="font-semibold text-slate-700">
                        Source
                      </TableHead>
                      <TableHead className="font-semibold text-slate-700">
                        Status
                      </TableHead>
                      <TableHead className="font-semibold text-slate-700">
                        Duration
                      </TableHead>
                      <TableHead className="text-center font-semibold text-slate-700">
                        Changes
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredLogs.map((log, index) => (
                      <TableRow
                        key={log.id}
                        className="transition-colors hover:bg-slate-50/50"
                      >
                        <TableCell className="font-medium text-slate-700">
                          {formatTimestamp(log.timestamp)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div
                              className={`h-3 w-3 rounded-full ${log.workspace?.color}`}
                            />
                            <span className="font-medium text-slate-700">
                              {log.workspace?.name}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>{getTypeBadge(log.type)}</TableCell>
                        <TableCell>
                          {log.triggeredBy ? (
                            <div className="flex items-center gap-2">
                              <Avatar className="h-7 w-7">
                                <AvatarImage
                                  src={
                                    log.triggeredBy.avatar || '/placeholder.svg'
                                  }
                                />
                                <AvatarFallback className="bg-slate-100 text-xs">
                                  {log.triggeredBy.name
                                    .split(' ')
                                    .map((n) => n[0])
                                    .join('')}
                                </AvatarFallback>
                              </Avatar>
                              <div className="flex min-w-0 flex-col">
                                <span className="truncate text-sm font-medium text-slate-700">
                                  {log.triggeredBy.name}
                                </span>
                                <span className="truncate text-xs text-slate-500">
                                  {log.triggeredBy.email}
                                </span>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100">
                                <Clock className="h-3 w-3 text-slate-500" />
                              </div>
                              <span className="text-sm font-medium text-slate-500">
                                System
                              </span>
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <CalendarDays className="h-4 w-4 text-slate-400" />
                            <span className="text-sm text-slate-600">
                              {log.calendarSource}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {getStatusBadge(log.status, log.error)}
                        </TableCell>
                        <TableCell className="font-mono text-sm text-slate-600">
                          {formatDuration(log.duration)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-center gap-2">
                            {log.events.added > 0 && (
                              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-green-100 text-xs font-medium text-green-700">
                                +{log.events.added}
                              </span>
                            )}
                            {log.events.updated > 0 && (
                              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-xs font-medium text-blue-700">
                                ~{log.events.updated}
                              </span>
                            )}
                            {log.events.deleted > 0 && (
                              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-red-100 text-xs font-medium text-red-700">
                                -{log.events.deleted}
                              </span>
                            )}
                            {log.events.added === 0 &&
                              log.events.updated === 0 &&
                              log.events.deleted === 0 && (
                                <span className="text-xs text-slate-400">
                                  No changes
                                </span>
                              )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {filteredLogs.length === 0 && (
                <div className="py-12 text-center">
                  <CalendarDays className="mx-auto mb-4 h-12 w-12 text-slate-300" />
                  <h3 className="mb-2 text-lg font-medium text-slate-600">
                    No sync logs found
                  </h3>
                  <p className="text-slate-500">
                    Try adjusting your search criteria or filters.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
