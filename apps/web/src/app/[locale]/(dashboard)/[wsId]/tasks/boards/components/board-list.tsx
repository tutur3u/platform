'use client';

import {
  BoardGroup,
  EnhancedBoard,
  GROUP_COLORS,
  ViewSettings,
} from '../types';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader } from '@tuturuuu/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import {
  AlertCircle,
  Archive,
  BarChart3,
  Calendar,
  ChevronDown,
  ChevronRight,
  Clock,
  Edit,
  ExternalLink,
  // AlertTriangle,
  Flag,
  MoreHorizontal,
  Plus,
  Trash2,
  TrendingUp,
  Users,
  X,
} from '@tuturuuu/ui/icons';
// import { Separator } from '@tuturuuu/ui/separator';
import { Input } from '@tuturuuu/ui/input';
import { Progress } from '@tuturuuu/ui/progress';
import { cn } from '@tuturuuu/utils/format';
import Link from 'next/link';
import { useState } from 'react';

interface BoardListProps {
  boards: EnhancedBoard[];
  settings: ViewSettings;
  count: number;
  onSettingsChange: (settings: ViewSettings) => void;
}

export function BoardList({
  boards,
  settings,
  onSettingsChange,
}: BoardListProps) {
  // Smart filtering logic
  const getFilteredBoards = () => {
    if (settings.forceShowAll) {
      return boards;
    }

    // For now, we'll show all boards since the smart filtering is based on data conditions
    // In the future, you could add user-controlled filters here
    return boards;
  };

  const filteredBoards = getFilteredBoards();

  const sortedBoards = [...filteredBoards].sort((a, b) => {
    switch (settings.sortBy) {
      case 'name':
        return settings.sortOrder === 'asc'
          ? a.name.localeCompare(b.name)
          : b.name.localeCompare(a.name);
      case 'id':
        return settings.sortOrder === 'asc'
          ? a.id.localeCompare(b.id)
          : b.id.localeCompare(a.id);
      case 'created_at':
        return settings.sortOrder === 'asc'
          ? new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          : new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      case 'progress':
        return settings.sortOrder === 'asc'
          ? a.stats.completionRate - b.stats.completionRate
          : b.stats.completionRate - a.stats.completionRate;
      case 'tasks':
        return settings.sortOrder === 'asc'
          ? a.stats.totalTasks - b.stats.totalTasks
          : b.stats.totalTasks - a.stats.totalTasks;
      case 'group':
        return settings.sortOrder === 'asc'
          ? (a.groupId || 'Default').localeCompare(b.groupId || 'Default')
          : (b.groupId || 'Default').localeCompare(a.groupId || 'Default');
      default:
        return 0;
    }
  });

  if (settings.viewMode === 'groups') {
    return (
      <GroupsView
        boards={sortedBoards}
        settings={settings}
        onSettingsChange={onSettingsChange}
      />
    );
  }

  // Enhanced cards view - 3 cards per row with scrolling
  return <EnhancedCardsView boards={sortedBoards} />;
}

function EnhancedCardsView({ boards }: { boards: EnhancedBoard[] }) {
  return (
    <div className="max-h-[70vh] space-y-6 overflow-y-auto">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {boards.map((board) => (
          <EnhancedBoardCard key={board.id} board={board} />
        ))}
      </div>
    </div>
  );
}

function EnhancedBoardCard({ board }: { board: EnhancedBoard }) {
  const [isHovered, setIsHovered] = useState(false);

  const progressColor =
    board.stats.completionRate >= 75
      ? 'from-emerald-400 to-emerald-600'
      : board.stats.completionRate >= 50
        ? 'from-blue-400 to-blue-600'
        : board.stats.completionRate >= 25
          ? 'from-yellow-400 to-yellow-600'
          : 'from-gray-400 to-gray-600';

  const groupColor =
    board.groupId && GROUP_COLORS[board.groupId as keyof typeof GROUP_COLORS]
      ? GROUP_COLORS[board.groupId as keyof typeof GROUP_COLORS]
      : GROUP_COLORS.Default;

  return (
    <Card
      className={cn(
        'group relative overflow-hidden transition-all duration-200',
        'hover:scale-[1.02] hover:shadow-lg',
        'border-l-4 bg-gradient-to-br from-card to-card/95',
        isHovered && 'scale-[1.02] shadow-lg'
      )}
      style={{ borderLeftColor: groupColor }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Alert Indicators */}
      <div className="absolute top-4 left-4 flex gap-1">
        {board.stats.hasUrgentTasks && (
          <div
            className="h-2 w-2 animate-pulse rounded-full bg-red-500"
            title="Has urgent tasks"
          />
        )}
        {board.stats.hasMultipleOverdue && (
          <div
            className="h-2 w-2 animate-pulse rounded-full bg-orange-500"
            title="Multiple overdue tasks"
          />
        )}
        {board.stats.hasWorkloadImbalance && (
          <div
            className="h-2 w-2 animate-pulse rounded-full bg-blue-500"
            title="Workload imbalance detected"
          />
        )}
      </div>

      <CardHeader className="space-y-4 pb-4">
        <div className="flex items-start justify-between">
          <div className="min-w-0 flex-1 space-y-1">
            <Link
              href={board.href}
              className="line-clamp-1 block text-lg font-bold transition-colors hover:text-primary"
            >
              {board.name}
            </Link>
            {board.groupId && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: groupColor }}
                />
                {board.groupId}
              </p>
            )}
          </div>
          <BoardActionsMenu board={board} />
        </div>

        {/* Enhanced Progress Bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Progress</span>
            <span className="font-bold text-foreground">
              {board.stats.completionRate}%
            </span>
          </div>
          <div className="relative">
            <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  'h-full rounded-full bg-gradient-to-r transition-all duration-700',
                  progressColor
                )}
                style={{ width: `${board.stats.completionRate}%` }}
              />
            </div>
            {board.stats.completionRate > 80 && (
              <div className="absolute -top-1 right-0 h-4 w-4 animate-bounce rounded-full bg-emerald-500 opacity-75" />
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Enhanced Stats Grid */}
        <div className="grid grid-cols-2 gap-4">
          <div className="flex items-center gap-2 rounded-lg bg-muted/30 p-3">
            <BarChart3 className="h-4 w-4 text-blue-600" />
            <div className="text-sm">
              <span className="block font-bold">{board.stats.totalTasks}</span>
              <span className="text-xs text-muted-foreground">tasks</span>
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-lg bg-muted/30 p-3">
            <Users className="h-4 w-4 text-green-600" />
            <div className="text-sm">
              <span className="block font-bold">{board.stats.totalLists}</span>
              <span className="text-xs text-muted-foreground">lists</span>
            </div>
          </div>
        </div>

        {/* Status Indicators */}
        <div className="space-y-2">
          {board.stats.activeTasks > 0 && (
            <div className="flex items-center justify-between rounded-lg bg-blue-50 p-2 dark:bg-blue-950/20">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-blue-600" />
                <span className="text-sm text-blue-700 dark:text-blue-300">
                  Active tasks
                </span>
              </div>
              <span className="font-semibold text-blue-700 dark:text-blue-300">
                {board.stats.activeTasks}
              </span>
            </div>
          )}

          {board.stats.overdueTasks > 0 && (
            <div className="flex items-center justify-between rounded-lg bg-red-50 p-2 dark:bg-red-950/20">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-red-600" />
                <span className="text-sm text-red-700 dark:text-red-300">
                  Overdue
                </span>
              </div>
              <span className="font-semibold text-red-700 dark:text-red-300">
                {board.stats.overdueTasks}
              </span>
            </div>
          )}
        </div>

        {/* Enhanced Priority Badges */}
        <div className="flex flex-wrap gap-1">
          {board.stats.priorityDistribution.urgent > 0 && (
            <Badge
              variant="destructive"
              className="gap-1 bg-red-500 text-xs shadow-sm hover:bg-red-600"
            >
              <Flag className="h-3 w-3" />
              {board.stats.priorityDistribution.urgent} urgent
            </Badge>
          )}
          {board.stats.priorityDistribution.high > 0 && (
            <Badge
              variant="secondary"
              className="gap-1 border-orange-200 bg-orange-100 text-xs text-orange-800"
            >
              <Flag className="h-3 w-3" />
              {board.stats.priorityDistribution.high} high
            </Badge>
          )}
          {board.stats.completionRate > 75 && (
            <Badge
              variant="outline"
              className="gap-1 border-emerald-200 bg-emerald-50 text-xs text-emerald-700"
            >
              <TrendingUp className="h-3 w-3" />
              High progress
            </Badge>
          )}
        </div>

        {/* Last Activity */}
        <div className="flex items-center gap-2 border-t border-border/50 pt-2 text-xs text-muted-foreground">
          <Calendar className="h-3 w-3" />
          <span>
            Updated {new Date(board.stats.lastActivity).toLocaleDateString()}
          </span>
        </div>

        {/* Enhanced Action Button */}
        <Link href={board.href} className="block">
          <Button
            className="w-full bg-gradient-to-r from-primary to-primary/90 shadow-md hover:from-primary/90 hover:to-primary"
            size="lg"
          >
            Open Board
            <ExternalLink className="ml-2 h-4 w-4" />
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}

function GroupsView({
  boards,
  settings,
  onSettingsChange,
}: {
  boards: EnhancedBoard[];
  settings: ViewSettings;
  onSettingsChange: (settings: ViewSettings) => void;
}) {
  const [groups, setGroups] = useState<BoardGroup[]>([
    {
      id: 'gaming',
      name: 'Gaming',
      boards: [],
      color: GROUP_COLORS.Gaming,
      order: 1,
    },
    {
      id: 'robotics',
      name: 'Robotics',
      boards: [],
      color: GROUP_COLORS.Robotics,
      order: 2,
    },
  ]);
  const [newGroupName, setNewGroupName] = useState('');
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);

  // Organize boards into groups
  const organizedGroups = groups.map((group) => ({
    ...group,
    boards: boards.filter((board) => board.groupId === group.id),
  }));

  // Unassigned boards
  const unassignedBoards = boards.filter(
    (board) => !groups.find((group) => group.id === board.groupId)
  );

  const handleCreateGroup = () => {
    if (newGroupName.trim()) {
      const newGroup: BoardGroup = {
        id: newGroupName.toLowerCase().replace(/\s+/g, '-'),
        name: newGroupName,
        boards: [],
        color: GROUP_COLORS.Default,
        order: groups.length + 1,
      };
      setGroups([...groups, newGroup]);
      setNewGroupName('');
      setIsCreatingGroup(false);
    }
  };

  const handleDeleteGroup = (groupId: string) => {
    setGroups(groups.filter((g) => g.id !== groupId));
  };

  const toggleGroup = (groupId: string) => {
    const collapsed = settings.groupView?.collapsed?.includes(groupId)
      ? settings.groupView.collapsed.filter((id) => id !== groupId)
      : [...(settings.groupView?.collapsed || []), groupId];

    onSettingsChange({
      ...settings,
      groupView: {
        ...settings.groupView,
        collapsed,
      },
    });
  };

  return (
    <div className="h-[70vh] overflow-hidden">
      <div className="flex h-full flex-col">
        {/* Groups Management Header */}
        <div className="mb-4 flex items-center justify-between rounded-lg border bg-muted/20 p-4">
          <h3 className="text-lg font-semibold">Board Groups</h3>
          <div className="flex items-center gap-2">
            {isCreatingGroup ? (
              <div className="flex items-center gap-2">
                <Input
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  placeholder="Group name"
                  className="w-32"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreateGroup();
                    if (e.key === 'Escape') setIsCreatingGroup(false);
                  }}
                />
                <Button size="sm" onClick={handleCreateGroup}>
                  Add
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsCreatingGroup(false)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <Button size="sm" onClick={() => setIsCreatingGroup(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Add Group
              </Button>
            )}
          </div>
        </div>

        {/* Scrollable Groups Container */}
        <div className="flex-1 overflow-x-auto">
          <div className="flex h-full min-w-max gap-6">
            {/* Existing Groups */}
            {organizedGroups.map((group) => (
              <GroupColumn
                key={group.id}
                group={group}
                isCollapsed={
                  settings.groupView?.collapsed?.includes(group.id) || false
                }
                onToggle={() => toggleGroup(group.id)}
                onDelete={() => handleDeleteGroup(group.id)}
              />
            ))}

            {/* Unassigned Boards Column */}
            {unassignedBoards.length > 0 && (
              <GroupColumn
                group={{
                  id: 'unassigned',
                  name: 'Unassigned',
                  boards: unassignedBoards,
                  color: GROUP_COLORS.Default,
                  order: 999,
                }}
                isCollapsed={false}
                onToggle={() => {}}
                onDelete={() => {}}
                isUnassigned
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function GroupColumn({
  group,
  isCollapsed,
  onToggle,
  onDelete,
  isUnassigned = false,
}: {
  group: BoardGroup;
  isCollapsed: boolean;
  onToggle: () => void;
  onDelete: () => void;
  isUnassigned?: boolean;
}) {
  const [dragOver, setDragOver] = useState(false);

  return (
    <div
      className={cn(
        'w-80 flex-shrink-0 rounded-lg border-2 border-dashed border-transparent bg-muted/30 transition-all',
        dragOver && 'border-primary bg-primary/10'
      )}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        // Handle board drop logic here
      }}
    >
      <div className="flex h-full flex-col p-4">
        {/* Group Header */}
        <div className="mb-4 flex items-center justify-between">
          <div
            className="flex cursor-pointer items-center gap-2"
            onClick={onToggle}
          >
            <div
              className="h-4 w-4 rounded-full"
              style={{ backgroundColor: group.color }}
            />
            <h4 className="font-semibold">{group.name}</h4>
            <Badge variant="outline" className="text-xs">
              {group.boards.length}
            </Badge>
            {!isUnassigned && (
              <Button variant="ghost" size="sm">
                {isCollapsed ? (
                  <ChevronRight className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </Button>
            )}
          </div>

          {!isUnassigned && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onDelete}
              className="text-destructive hover:text-destructive"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* Boards List */}
        {!isCollapsed && (
          <div className="flex-1 space-y-3 overflow-y-auto">
            {group.boards.map((board) => (
              <DraggableBoardCard
                key={board.id}
                board={board}
                groupColor={group.color}
              />
            ))}

            {group.boards.length === 0 && (
              <div className="flex h-32 items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/30 text-sm text-muted-foreground">
                Drop boards here
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function DraggableBoardCard({
  board,
  groupColor,
}: {
  board: EnhancedBoard;
  groupColor: string;
}) {
  const [isDragging, setIsDragging] = useState(false);

  return (
    <Card
      className={cn(
        'cursor-move border-l-4 transition-all duration-200',
        isDragging
          ? 'scale-105 rotate-1 opacity-75 shadow-lg'
          : 'hover:scale-102 hover:shadow-md'
      )}
      style={{ borderLeftColor: groupColor }}
      draggable
      onDragStart={() => setIsDragging(true)}
      onDragEnd={() => setIsDragging(false)}
    >
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center justify-between">
          <Link
            href={board.href}
            className="line-clamp-1 font-medium transition-colors hover:text-primary"
          >
            {board.name}
          </Link>
          <BoardActionsMenu board={board} />
        </div>

        {/* Progress */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Progress</span>
            <span className="font-medium">{board.stats.completionRate}%</span>
          </div>
          <Progress value={board.stats.completionRate} className="h-1" />
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="flex items-center gap-1">
            <BarChart3 className="h-3 w-3 text-blue-500" />
            <span>{board.stats.totalTasks} tasks</span>
          </div>
          <div className="flex items-center gap-1">
            <Users className="h-3 w-3 text-green-500" />
            <span>{board.stats.totalLists} lists</span>
          </div>
        </div>

        {/* Status Badges */}
        <div className="flex flex-wrap gap-1">
          {board.stats.hasUrgentTasks && (
            <Badge variant="destructive" className="text-xs">
              Urgent
            </Badge>
          )}
          {board.stats.hasMultipleOverdue && (
            <Badge
              variant="secondary"
              className="bg-orange-100 text-xs text-orange-800"
            >
              Overdue
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function BoardActionsMenu({ board }: { board: EnhancedBoard }) {
  const handleEdit = () => {
    console.log('Edit board:', board.id);
    // TODO: Implement edit functionality
  };

  const handleArchive = () => {
    console.log('Archive board:', board.id);
    // TODO: Implement archive functionality
  };

  const handleDelete = () => {
    console.log('Delete board:', board.id);
    // TODO: Implement delete functionality
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="opacity-0 transition-opacity group-hover:opacity-100"
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem
          onClick={handleEdit}
          className="flex items-center gap-2"
        >
          <Edit className="h-4 w-4" />
          Edit Board
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={handleArchive}
          className="flex items-center gap-2 text-orange-600"
        >
          <Archive className="h-4 w-4" />
          Archive Board
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={handleDelete}
          className="flex items-center gap-2 text-destructive"
        >
          <Trash2 className="h-4 w-4" />
          Delete Board
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
