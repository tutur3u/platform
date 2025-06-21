'use client';

import { projectColumns } from './columns';
import { BoardList } from './components/board-list';
import { ViewSettingsPanel } from './components/view-settings';
import {
  DEFAULT_VIEW_SETTINGS,
  EnhancedBoard,
  STORAGE_KEYS,
  SmartFilters,
  ViewSettings,
} from './types';
import { CustomDataTable } from '@/components/custom-data-table';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  AlertCircle,
  Clock,
  Columns,
  Flag,
  Grid3X3,
  LayoutGrid,
  List,
  RefreshCw,
  TrendingUp,
} from '@tuturuuu/ui/icons';
import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';

interface EnhancedTaskBoardsContentProps {
  boards: EnhancedBoard[];
  count: number;
  wsId: string;
  isOwner?: boolean;
}

function EnhancedTaskBoardsContentInner({
  boards,
  count,
  wsId: _wsId,
  isOwner = false,
}: EnhancedTaskBoardsContentProps) {
  const [settings, setSettings] = useState<ViewSettings>(DEFAULT_VIEW_SETTINGS);

  // Load settings from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.VIEW_SETTINGS);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setSettings({ ...DEFAULT_VIEW_SETTINGS, ...parsed });
      } catch (error) {
        console.error('Failed to parse saved view settings:', error);
      }
    }
  }, []);

  // Save settings to localStorage
  const handleSettingsChange = (newSettings: ViewSettings) => {
    setSettings(newSettings);
    localStorage.setItem(
      STORAGE_KEYS.VIEW_SETTINGS,
      JSON.stringify(newSettings)
    );
  };

  // Create smart filters data
  const smartFilters: SmartFilters = {
    hasUrgentTasks: boards.some((b) => b.stats.hasUrgentTasks),
    hasMultipleOverdue: boards.some((b) => b.stats.hasMultipleOverdue),
    hasWorkloadImbalance: boards.some((b) => b.stats.hasWorkloadImbalance),
  };

  // Refresh function
  const handleRefresh = async () => {
    // Trigger a page refresh or data refetch
    window.location.reload();
  };

  // Quick view mode toggle buttons
  const viewModeButtons = [
    { mode: 'table' as const, icon: List, label: 'Table' },
    { mode: 'cards' as const, icon: LayoutGrid, label: 'Cards' },
    { mode: 'groups' as const, icon: Grid3X3, label: 'Groups' },
  ];

  // Summary statistics
  const totalActiveBoards = boards.filter(
    (b) => b.stats.activeTasks > 0
  ).length;
  const totalUrgentTasks = boards.reduce(
    (sum, b) => sum + b.stats.priorityDistribution.urgent,
    0
  );
  const totalOverdueBoards = boards.filter(
    (b) => b.stats.overdueTasks > 0
  ).length;
  const avgProgress =
    boards.length > 0
      ? Math.round(
          boards.reduce((sum, b) => sum + b.stats.completionRate, 0) /
            boards.length
        )
      : 0;

  return (
    <div className="space-y-6">
      {/* Enhanced Header with Quick Stats */}
      <div className="flex flex-col justify-between gap-4 rounded-lg border bg-muted/20 p-4 lg:flex-row lg:items-center">
        <div className="grid flex-1 grid-cols-2 gap-4 lg:grid-cols-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-blue-600" />
            <div className="text-sm">
              <span className="font-semibold">{avgProgress}%</span>
              <span className="ml-1 text-muted-foreground">avg progress</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-green-600" />
            <div className="text-sm">
              <span className="font-semibold">{totalActiveBoards}</span>
              <span className="ml-1 text-muted-foreground">active boards</span>
            </div>
          </div>

          {totalUrgentTasks > 0 && (
            <div className="flex items-center gap-2">
              <Flag className="h-4 w-4 text-red-600" />
              <div className="text-sm">
                <span className="font-semibold text-red-600">
                  {totalUrgentTasks}
                </span>
                <span className="ml-1 text-muted-foreground">urgent tasks</span>
              </div>
            </div>
          )}

          {totalOverdueBoards > 0 && (
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-orange-600" />
              <div className="text-sm">
                <span className="font-semibold text-orange-600">
                  {totalOverdueBoards}
                </span>
                <span className="ml-1 text-muted-foreground">
                  overdue boards
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Enhanced Controls */}
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            {count} board{count !== 1 ? 's' : ''}
          </span>
          {(smartFilters.hasUrgentTasks ||
            smartFilters.hasMultipleOverdue ||
            smartFilters.hasWorkloadImbalance) &&
            !settings.forceShowAll && (
              <Badge variant="outline" className="text-xs">
                Smart filters active
              </Badge>
            )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* View Mode Buttons */}
          <div className="flex items-center rounded-lg border bg-background p-1">
            {viewModeButtons.map(({ mode, icon: Icon, label }) => (
              <Button
                key={mode}
                variant={settings.viewMode === mode ? 'default' : 'ghost'}
                size="sm"
                onClick={() =>
                  handleSettingsChange({ ...settings, viewMode: mode })
                }
                className="flex items-center gap-2 text-xs"
              >
                <Icon className="h-4 w-4" />
                {label}
              </Button>
            ))}
          </div>

          {/* Original Table Controls - Only show for table mode */}
          {settings.viewMode === 'table' && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                className="flex items-center gap-2"
              >
                <RefreshCw className="h-4 w-4" />
                Refresh
              </Button>

              <Button
                variant="outline"
                size="sm"
                className="flex items-center gap-2"
              >
                <Columns className="h-4 w-4" />
                Columns
              </Button>
            </div>
          )}

          {/* View Settings */}
          <ViewSettingsPanel
            settings={settings}
            onSettingsChange={handleSettingsChange}
            onRefresh={handleRefresh}
            smartFilters={smartFilters}
            isOwner={isOwner}
          />
        </div>
      </div>

      {/* Content based on view mode */}
      {settings.viewMode === 'table' ? (
        <CustomDataTable
          data={boards}
          columnGenerator={projectColumns}
          namespace="task-boards"
          defaultVisibility={{
            id: false,
          }}
          pageSize={settings.pagination?.pageSize || 5}
          hideToolbar={false}
          hidePagination={false}
        />
      ) : (
        <BoardList
          boards={boards}
          settings={settings}
          count={count}
          onSettingsChange={handleSettingsChange}
        />
      )}
    </div>
  );
}

export const EnhancedTaskBoardsContent = dynamic(
  () => Promise.resolve(EnhancedTaskBoardsContentInner),
  {
    ssr: false,
    loading: () => (
      <div className="space-y-4">
        <div className="h-16 animate-pulse rounded bg-muted/50" />
        <div className="h-8 animate-pulse rounded bg-muted/50" />
        <div className="h-64 animate-pulse rounded bg-muted/50" />
      </div>
    ),
  }
);
