'use client';

import { Download, Filter, RefreshCw, Search, X } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { toast } from '@tuturuuu/ui/sonner';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

interface Props {
  wsId: string;
  totalCount: number;
}

export default function SyncFilters({ wsId, totalCount }: Props) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [countdown, setCountdown] = useState(30);

  // Auto-refresh logic
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          router.refresh();
          return 30;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [autoRefresh, router]);

  const handleExport = async (format: 'csv' | 'json') => {
    try {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/calendar-sync/export?format=${format}`,
        {
          method: 'GET',
        }
      );

      if (!response.ok) {
        throw new Error('Export failed');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `calendar-sync-logs-${new Date().toISOString().split('T')[0]}.${format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast.success(
        `Exported ${totalCount} sync logs as ${format.toUpperCase()}`
      );
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Export failed', {
        description: 'Unable to export sync logs. Please try again.',
      });
    }
  };

  const activeFilterCount = [
    statusFilter !== 'all',
    typeFilter !== 'all',
    searchQuery.length > 0,
  ].filter(Boolean).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search sync logs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
          {searchQuery && (
            <Button
              variant="ghost"
              size="sm"
              className="absolute top-1/2 right-1 h-7 w-7 -translate-y-1/2 p-0"
              onClick={() => setSearchQuery('')}
            >
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>

        {/* Status Filter */}
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="running">Running</SelectItem>
          </SelectContent>
        </Select>

        {/* Type Filter */}
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="background">Background</SelectItem>
            <SelectItem value="manual">Manual</SelectItem>
          </SelectContent>
        </Select>

        {/* Export */}
        <Select
          onValueChange={(value) => handleExport(value as 'csv' | 'json')}
        >
          <SelectTrigger className="w-[130px]">
            <Download className="mr-2 h-4 w-4" />
            <SelectValue placeholder="Export" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="csv">Export CSV</SelectItem>
            <SelectItem value="json">Export JSON</SelectItem>
          </SelectContent>
        </Select>

        {/* Auto-refresh Toggle */}
        <Button
          variant={autoRefresh ? 'default' : 'outline'}
          size="sm"
          onClick={() => {
            setAutoRefresh(!autoRefresh);
            setCountdown(30);
          }}
          className="gap-2"
        >
          <RefreshCw
            className={`h-4 w-4 ${autoRefresh ? 'animate-spin' : ''}`}
          />
          {autoRefresh ? `${countdown}s` : 'Auto-refresh'}
        </Button>

        {/* Active Filters Badge */}
        {activeFilterCount > 0 && (
          <Badge variant="secondary" className="gap-1">
            <Filter className="h-3 w-3" />
            {activeFilterCount} {activeFilterCount === 1 ? 'filter' : 'filters'}
          </Badge>
        )}
      </div>

      {/* Total Count */}
      <div className="text-muted-foreground text-sm">
        Showing {totalCount} sync {totalCount === 1 ? 'log' : 'logs'}
      </div>
    </div>
  );
}
