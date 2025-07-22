'use client';

import type { SyncLog, User, Workspace } from './types';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Badge } from '@tuturuuu/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
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
import {
  AlertCircle,
  Building2,
  CalendarDays,
  CheckCircle2,
  Clock,
  Filter,
  Loader2,
  Search,
  Zap,
} from 'lucide-react';

interface SyncLogsTableProps {
  syncLogs: SyncLog[];
  workspaces: Workspace[];
  filterType: string;
  filterWorkspace: string;
  searchTerm: string;
  onFilterTypeChange: (value: string) => void;
  onFilterWorkspaceChange: (value: string) => void;
  onSearchTermChange: (value: string) => void;
}

export function SyncLogsTable({
  syncLogs,
  workspaces,
  filterType,
  filterWorkspace,
  searchTerm,
  onFilterTypeChange,
  onFilterWorkspaceChange,
  onSearchTermChange,
}: SyncLogsTableProps) {
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
                onChange={(e) => onSearchTermChange(e.target.value)}
                className="border-slate-200 bg-white/80 pl-10"
              />
            </div>
          </div>
          <div className="flex gap-3">
            <Select
              value={filterWorkspace}
              onValueChange={onFilterWorkspaceChange}
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
            <Select value={filterType} onValueChange={onFilterTypeChange}>
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
              {syncLogs.map((log) => (
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
                            src={log.triggeredBy.avatar || '/placeholder.svg'}
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
                  <TableCell>{getStatusBadge(log.status, log.error)}</TableCell>
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

        {syncLogs.length === 0 && (
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
  );
}
