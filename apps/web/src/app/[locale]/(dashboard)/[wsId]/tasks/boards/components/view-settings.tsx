'use client';

import { SmartFilters, ViewSettings } from '../types';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { Columns3, RefreshCw, SortAsc, SortDesc } from '@tuturuuu/ui/icons';
import { useState } from 'react';

interface ViewSettingsPanelProps {
  settings: ViewSettings;
  onSettingsChange: (settings: ViewSettings) => void;
  onRefresh?: () => void;
  smartFilters: SmartFilters;
  isOwner?: boolean;
}

export function ViewSettingsPanel({
  settings,
  onSettingsChange,
  onRefresh,
  smartFilters,
  isOwner = false,
}: ViewSettingsPanelProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    if (onRefresh) {
      setIsRefreshing(true);
      await onRefresh();
      setTimeout(() => setIsRefreshing(false), 1000);
    }
  };

  // Table mode: Show comprehensive columns and data management options
  if (settings.viewMode === 'table') {
    return (
      <div className="flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 gap-2">
              <Columns3 className="h-4 w-4" />
              Columns & Data
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            {/* Refresh Section */}
            <DropdownMenuLabel className="flex items-center gap-2">
              <RefreshCw className="h-4 w-4" />
              Data Management
            </DropdownMenuLabel>
            <div className="px-2 pb-2">
              <Button
                variant="outline"
                size="sm"
                className="h-8 w-full gap-2"
                onClick={handleRefresh}
                disabled={isRefreshing}
              >
                <RefreshCw
                  className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`}
                />
                {isRefreshing ? 'Refreshing...' : 'Refresh Data'}
              </Button>
            </div>

            <DropdownMenuSeparator />

            {/* Sorting Section */}
            <DropdownMenuLabel className="flex items-center gap-2">
              <SortAsc className="h-4 w-4" />
              Sort Options
            </DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={settings.sortBy}
              onValueChange={(value) =>
                onSettingsChange({ ...settings, sortBy: value as any })
              }
            >
              <DropdownMenuRadioItem value="name">
                Sort by Name
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="id">
                Sort by ID
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="created_at">
                Sort by Created Date
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="progress">
                Sort by Progress
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="tasks">
                Sort by Task Count
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>

            <div className="px-2 pt-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-full justify-start gap-2"
                onClick={() =>
                  onSettingsChange({
                    ...settings,
                    sortOrder: settings.sortOrder === 'asc' ? 'desc' : 'asc',
                  })
                }
              >
                {settings.sortOrder === 'asc' ? (
                  <>
                    <SortAsc className="h-4 w-4" />
                    Ascending
                  </>
                ) : (
                  <>
                    <SortDesc className="h-4 w-4" />
                    Descending
                  </>
                )}
              </Button>
            </div>

            <DropdownMenuSeparator />

            {/* Column Visibility Section */}
            {isOwner && (
              <>
                <DropdownMenuLabel>Column Visibility</DropdownMenuLabel>
                <DropdownMenuCheckboxItem
                  checked={settings.visibleColumns?.includes('board') ?? true}
                  onCheckedChange={(checked) => {
                    const columns = settings.visibleColumns || [
                      'board',
                      'progress',
                      'tasks',
                      'status',
                      'last_updated',
                      'actions',
                    ];
                    const newColumns = checked
                      ? [...columns.filter((c) => c !== 'board'), 'board']
                      : columns.filter((c) => c !== 'board');
                    onSettingsChange({
                      ...settings,
                      visibleColumns: newColumns,
                    });
                  }}
                >
                  Board Name
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={
                    settings.visibleColumns?.includes('progress') ?? true
                  }
                  onCheckedChange={(checked) => {
                    const columns = settings.visibleColumns || [
                      'board',
                      'progress',
                      'tasks',
                      'status',
                      'last_updated',
                      'actions',
                    ];
                    const newColumns = checked
                      ? [...columns.filter((c) => c !== 'progress'), 'progress']
                      : columns.filter((c) => c !== 'progress');
                    onSettingsChange({
                      ...settings,
                      visibleColumns: newColumns,
                    });
                  }}
                >
                  Progress
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={settings.visibleColumns?.includes('tasks') ?? true}
                  onCheckedChange={(checked) => {
                    const columns = settings.visibleColumns || [
                      'board',
                      'progress',
                      'tasks',
                      'status',
                      'last_updated',
                      'actions',
                    ];
                    const newColumns = checked
                      ? [...columns.filter((c) => c !== 'tasks'), 'tasks']
                      : columns.filter((c) => c !== 'tasks');
                    onSettingsChange({
                      ...settings,
                      visibleColumns: newColumns,
                    });
                  }}
                >
                  Tasks
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={settings.visibleColumns?.includes('status') ?? true}
                  onCheckedChange={(checked) => {
                    const columns = settings.visibleColumns || [
                      'board',
                      'progress',
                      'tasks',
                      'status',
                      'last_updated',
                      'actions',
                    ];
                    const newColumns = checked
                      ? [...columns.filter((c) => c !== 'status'), 'status']
                      : columns.filter((c) => c !== 'status');
                    onSettingsChange({
                      ...settings,
                      visibleColumns: newColumns,
                    });
                  }}
                >
                  Status
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={
                    settings.visibleColumns?.includes('last_updated') ?? true
                  }
                  onCheckedChange={(checked) => {
                    const columns = settings.visibleColumns || [
                      'board',
                      'progress',
                      'tasks',
                      'status',
                      'last_updated',
                      'actions',
                    ];
                    const newColumns = checked
                      ? [
                          ...columns.filter((c) => c !== 'last_updated'),
                          'last_updated',
                        ]
                      : columns.filter((c) => c !== 'last_updated');
                    onSettingsChange({
                      ...settings,
                      visibleColumns: newColumns,
                    });
                  }}
                >
                  Last Updated
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={settings.visibleColumns?.includes('actions') ?? true}
                  onCheckedChange={(checked) => {
                    const columns = settings.visibleColumns || [
                      'board',
                      'progress',
                      'tasks',
                      'status',
                      'last_updated',
                      'actions',
                    ];
                    const newColumns = checked
                      ? [...columns.filter((c) => c !== 'actions'), 'actions']
                      : columns.filter((c) => c !== 'actions');
                    onSettingsChange({
                      ...settings,
                      visibleColumns: newColumns,
                    });
                  }}
                >
                  Actions
                </DropdownMenuCheckboxItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  }

  // Cards and Groups modes: Show smart alerts and sorting
  const activeFilters = [
    smartFilters.hasUrgentTasks && 'Urgent Tasks',
    smartFilters.hasMultipleOverdue && 'Multiple Overdue',
    smartFilters.hasWorkloadImbalance && 'Workload Imbalance',
    settings.forceShowAll && 'Show All Override',
  ].filter(Boolean);

  return (
    <div className="flex items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 gap-2">
            <Columns3 className="h-4 w-4" />
            View Options
            {activeFilters.length > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                {activeFilters.length}
              </Badge>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          {/* Smart Alerts */}
          <DropdownMenuLabel>Smart Alerts</DropdownMenuLabel>
          {smartFilters.hasUrgentTasks && (
            <div className="px-2 py-1">
              <Badge variant="destructive" className="text-xs">
                🚨 Urgent tasks detected
              </Badge>
            </div>
          )}
          {smartFilters.hasMultipleOverdue && (
            <div className="px-2 py-1">
              <Badge variant="destructive" className="text-xs">
                ⏰ Multiple overdue tasks
              </Badge>
            </div>
          )}
          {smartFilters.hasWorkloadImbalance && (
            <div className="px-2 py-1">
              <Badge variant="destructive" className="text-xs">
                ⚖️ Workload imbalance detected
              </Badge>
            </div>
          )}
          {activeFilters.length === 0 && (
            <div className="px-2 py-1 text-sm text-muted-foreground">
              No alerts detected
            </div>
          )}

          <DropdownMenuSeparator />

          {/* Sorting Options */}
          <DropdownMenuLabel className="flex items-center gap-2">
            <SortAsc className="h-4 w-4" />
            Sort Options
          </DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={settings.sortBy}
            onValueChange={(value) =>
              onSettingsChange({ ...settings, sortBy: value as any })
            }
          >
            <DropdownMenuRadioItem value="name">
              Sort by Name
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="id">Sort by ID</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="created_at">
              Sort by Created Date
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="progress">
              Sort by Progress
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="tasks">
              Sort by Task Count
            </DropdownMenuRadioItem>
            {settings.viewMode === 'groups' && (
              <DropdownMenuRadioItem value="group">
                Sort by Group
              </DropdownMenuRadioItem>
            )}
          </DropdownMenuRadioGroup>

          <div className="px-2 pt-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-full justify-start gap-2"
              onClick={() =>
                onSettingsChange({
                  ...settings,
                  sortOrder: settings.sortOrder === 'asc' ? 'desc' : 'asc',
                })
              }
            >
              {settings.sortOrder === 'asc' ? (
                <>
                  <SortAsc className="h-4 w-4" />
                  Ascending
                </>
              ) : (
                <>
                  <SortDesc className="h-4 w-4" />
                  Descending
                </>
              )}
            </Button>
          </div>

          <DropdownMenuSeparator />

          {/* View Mode Specific Options */}
          {settings.viewMode === 'groups' && (
            <>
              <DropdownMenuLabel>Groups Options</DropdownMenuLabel>
              <div className="px-2 py-1 text-sm text-muted-foreground">
                💡 Drag boards between groups to organize
              </div>
            </>
          )}

          {/* Override Controls */}
          <DropdownMenuSeparator />
          <DropdownMenuCheckboxItem
            checked={settings.forceShowAll}
            onCheckedChange={(checked) =>
              onSettingsChange({ ...settings, forceShowAll: checked })
            }
          >
            Force Show All (Override Filters)
          </DropdownMenuCheckboxItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
