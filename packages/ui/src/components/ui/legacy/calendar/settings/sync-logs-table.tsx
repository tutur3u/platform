'use client';

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
} from '@tuturuuu/icons';
import type { Workspace } from '@tuturuuu/types';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Badge } from '@tuturuuu/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import { DataPagination } from '@tuturuuu/ui/custom/data-pagination';
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
import { useState } from 'react';
import type { SyncLog } from './types';

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
  // Internal pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

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

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return (
          <Badge
            variant="outline"
            className="border-dynamic-green/10 bg-dynamic-green/10 font-medium text-dynamic-green"
          >
            <CheckCircle2 className="mr-1 h-3 w-3" />
            Completed
          </Badge>
        );
      case 'failed':
        return (
          <Badge
            variant="outline"
            className="border-dynamic-red/10 bg-dynamic-red/10 font-medium text-dynamic-red"
          >
            <AlertCircle className="mr-1 h-3 w-3" />
            Failed
          </Badge>
        );
      case 'running':
        return (
          <Badge
            variant="outline"
            className="border-dynamic-blue/10 bg-dynamic-blue/10 font-medium text-dynamic-blue"
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
        className="border-dynamic-purple/10 bg-dynamic-purple/10 font-medium text-dynamic-purple"
      >
        <Zap className="mr-1 h-3 w-3" />
        {type.charAt(0).toUpperCase() + type.slice(1)}
      </Badge>
    ) : type === 'background' ? (
      <Badge
        variant="outline"
        className="border-dynamic-blue/10 bg-dynamic-blue/10 font-medium text-dynamic-blue"
      >
        <Clock className="mr-1 h-3 w-3" />
        {type.charAt(0).toUpperCase() + type.slice(1)}
      </Badge>
    ) : (
      <Badge
        variant="outline"
        className="border-dynamic-green/10 bg-dynamic-green/10 font-medium text-dynamic-green"
      >
        {type.charAt(0).toUpperCase() + type.slice(1)}
      </Badge>
    );
  };

  // Calculate pagination values
  const totalCount = syncLogs.length;
  const totalPages = Math.ceil(totalCount / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedLogs = syncLogs.slice(startIndex, endIndex);

  // Reset to first page when filters change
  const handleFilterTypeChange = (value: string) => {
    setCurrentPage(1);
    onFilterTypeChange(value);
  };

  const handleFilterWorkspaceChange = (value: string) => {
    setCurrentPage(1);
    onFilterWorkspaceChange(value);
  };

  const handleSearchTermChange = (value: string) => {
    setCurrentPage(1);
    onSearchTermChange(value);
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const handlePageSizeChange = (newPageSize: number) => {
    setPageSize(newPageSize);
    setCurrentPage(1); // Reset to first page when changing page size
  };

  return (
    <Card className="border-0 bg-foreground/10 shadow-sm backdrop-blur-sm">
      <CardHeader className="pb-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-xl">Synchronization Activity</CardTitle>
            <CardDescription className="mt-1 opacity-70">
              Real-time calendar sync logs across all workspaces
            </CardDescription>
          </div>
        </div>

        <Separator className="my-4" />

        {/* Filters */}
        <div className="flex flex-col gap-4 lg:flex-row">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 transform text-foreground/50" />
              <Input
                placeholder="Search by user, workspace, or calendar source..."
                value={searchTerm}
                onChange={(e) => handleSearchTermChange(e.target.value)}
                className="border-foreground/10 bg-foreground/10 pl-10"
              />
            </div>
          </div>
          <div className="flex gap-3">
            <Select
              value={filterWorkspace}
              onValueChange={handleFilterWorkspaceChange}
            >
              <SelectTrigger className="w-[180px] border-foreground/10 bg-foreground/10">
                <Building2 className="mr-2 h-4 w-4 text-foreground/50" />
                <SelectValue placeholder="All Workspaces" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Workspaces</SelectItem>
                {workspaces.map((workspace, index) => (
                  <SelectItem
                    key={`${workspace.id}-${index}`}
                    value={workspace.id}
                  >
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-blue-500" />
                      {workspace.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterType} onValueChange={handleFilterTypeChange}>
              <SelectTrigger className="w-[140px] border-foreground/10 bg-foreground/10">
                <Filter className="mr-2 h-4 w-4 text-foreground/50" />
                <SelectValue placeholder="All Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="active">Active Sync</SelectItem>
                <SelectItem value="background">Background Sync</SelectItem>
                <SelectItem value="manual">Manual Sync</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        <div className="overflow-hidden rounded-lg border border-foreground/10 bg-foreground/10">
          <Table>
            <TableHeader>
              <TableRow className="bg-foreground/10">
                <TableHead className="font-semibold">Time</TableHead>
                <TableHead className="font-semibold">Workspace</TableHead>
                <TableHead className="font-semibold">Type</TableHead>
                <TableHead className="font-semibold">Triggered By</TableHead>
                <TableHead className="font-semibold">Source</TableHead>
                <TableHead className="font-semibold">Status</TableHead>
                <TableHead className="font-semibold">Duration</TableHead>
                <TableHead className="text-center font-semibold">
                  Changes
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedLogs.map((log) => (
                <TableRow
                  key={log.id}
                  className="transition-colors hover:bg-slate-50/50"
                >
                  <TableCell className="font-medium">
                    {formatTimestamp(log.timestamp)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div
                        className={`h-3 w-3 rounded-full ${log.workspace?.color}`}
                      />
                      <span className="font-medium">
                        {log.workspace?.name || 'Unknown Workspace'}
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
                          <AvatarFallback className="bg-foreground/10 text-xs">
                            {(log.triggeredBy.display_name || 'U')
                              .split(' ')
                              .map((n) => n[0])
                              .join('')}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex min-w-0 flex-col">
                          <span className="truncate font-medium text-sm">
                            {log.triggeredBy.display_name || 'Unknown User'}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-foreground/10">
                          <Clock className="h-3 w-3 text-foreground/50" />
                        </div>
                        <span className="font-medium text-foreground/50 text-sm">
                          System
                        </span>
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <CalendarDays className="h-4 w-4 text-foreground/50" />
                      <span className="text-foreground/50 text-sm">
                        {log.calendarSource}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>{getStatusBadge(log.status)}</TableCell>
                  <TableCell className="font-mono text-foreground/50 text-sm">
                    {formatDuration(log.duration)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-center gap-2">
                      {log.events.added > 0 && (
                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-green-100 font-medium text-green-700 text-xs">
                          +{log.events.added}
                        </span>
                      )}
                      {log.events.updated > 0 && (
                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 font-medium text-blue-700 text-xs">
                          ~{log.events.updated}
                        </span>
                      )}
                      {log.events.deleted > 0 && (
                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-red-100 font-medium text-red-700 text-xs">
                          -{log.events.deleted}
                        </span>
                      )}
                      {log.events.added === 0 &&
                        log.events.updated === 0 &&
                        log.events.deleted === 0 && (
                          <span className="text-xs opacity-70">No changes</span>
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
            <CalendarDays className="mx-auto mb-4 h-12 w-12 text-foreground/50" />
            <h3 className="mb-2 font-medium text-lg">No sync logs found</h3>
            <p className="text-foreground/50">
              Try adjusting your search criteria or filters.
            </p>
          </div>
        )}

        {/* Pagination */}
        {syncLogs.length > 0 && totalPages > 1 && (
          <div className="mt-6">
            <DataPagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalCount={totalCount}
              pageSize={pageSize}
              onPageChange={handlePageChange}
              onPageSizeChange={handlePageSizeChange}
              itemName="sync logs"
              pageSizeOptions={[10, 20, 50, 100]}
              showPageSizeSelector={totalCount > 10}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
