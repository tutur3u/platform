'use client';

import { EnhancedBoard, ViewSettings, BoardGroup, GROUP_COLORS } from '../types';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader } from '@tuturuuu/ui/card';
import { Progress } from '@tuturuuu/ui/progress';
// import { Separator } from '@tuturuuu/ui/separator';
import { Input } from '@tuturuuu/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { 
  Calendar,
  Clock,
  BarChart3,
  Users,
  // AlertTriangle,
  Flag,
  TrendingUp,
  ExternalLink,
  MoreHorizontal,
  Edit,
  Archive,
  Trash2,
  ChevronDown,
  ChevronRight,
  Plus,
  X,
  AlertCircle
} from '@tuturuuu/ui/icons';
import { cn } from '@tuturuuu/utils/format';
import Link from 'next/link';
import { useState } from 'react';

interface BoardListProps {
  boards: EnhancedBoard[];
  settings: ViewSettings;
  count: number;
  onSettingsChange: (settings: ViewSettings) => void;
}

export function BoardList({ boards, settings, onSettingsChange }: BoardListProps) {
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
    <div className="max-h-[70vh] overflow-y-auto space-y-6">
      <div className="grid gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        {boards.map((board) => (
          <EnhancedBoardCard key={board.id} board={board} />
        ))}
      </div>
    </div>
  );
}

function EnhancedBoardCard({ board }: { board: EnhancedBoard }) {
  const [isHovered, setIsHovered] = useState(false);
  
  const progressColor = board.stats.completionRate >= 75 ? 'from-emerald-400 to-emerald-600' : 
                       board.stats.completionRate >= 50 ? 'from-blue-400 to-blue-600' : 
                       board.stats.completionRate >= 25 ? 'from-yellow-400 to-yellow-600' : 'from-gray-400 to-gray-600';

  const groupColor = board.groupId && GROUP_COLORS[board.groupId as keyof typeof GROUP_COLORS]
    ? GROUP_COLORS[board.groupId as keyof typeof GROUP_COLORS]
    : GROUP_COLORS.Default;

  return (
    <Card 
      className={cn(
        "group relative overflow-hidden transition-all duration-200",
        "hover:shadow-lg hover:scale-[1.02]",
        "border-l-4 bg-gradient-to-br from-card to-card/95",
        isHovered && "shadow-lg scale-[1.02]"
      )}
      style={{ borderLeftColor: groupColor }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Alert Indicators */}
      <div className="absolute top-4 left-4 flex gap-1">
        {board.stats.hasUrgentTasks && (
          <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" title="Has urgent tasks" />
        )}
        {board.stats.hasMultipleOverdue && (
          <div className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" title="Multiple overdue tasks" />
        )}
        {board.stats.hasWorkloadImbalance && (
          <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" title="Workload imbalance detected" />
        )}
      </div>

      <CardHeader className="space-y-4 pb-4">
        <div className="flex items-start justify-between">
          <div className="min-w-0 flex-1 space-y-1">
            <Link 
              href={board.href}
              className="font-bold text-lg hover:text-primary transition-colors line-clamp-1 block"
            >
              {board.name}
            </Link>
            {board.groupId && (
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <span 
                  className="w-2 h-2 rounded-full"
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
            <span className="font-bold text-foreground">{board.stats.completionRate}%</span>
          </div>
          <div className="relative">
            <div className="w-full h-3 bg-muted rounded-full overflow-hidden">
              <div 
                className={cn("h-full rounded-full bg-gradient-to-r transition-all duration-700", progressColor)}
                style={{ width: `${board.stats.completionRate}%` }}
              />
            </div>
            {board.stats.completionRate > 80 && (
              <div className="absolute -top-1 right-0 w-4 h-4 bg-emerald-500 rounded-full animate-bounce opacity-75" />
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Enhanced Stats Grid */}
        <div className="grid grid-cols-2 gap-4">
          <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/30">
            <BarChart3 className="h-4 w-4 text-blue-600" />
            <div className="text-sm">
              <span className="font-bold block">{board.stats.totalTasks}</span>
              <span className="text-muted-foreground text-xs">tasks</span>
            </div>
          </div>

          <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/30">
            <Users className="h-4 w-4 text-green-600" />
            <div className="text-sm">
              <span className="font-bold block">{board.stats.totalLists}</span>
              <span className="text-muted-foreground text-xs">lists</span>
            </div>
          </div>
        </div>

        {/* Status Indicators */}
        <div className="space-y-2">
          {board.stats.activeTasks > 0 && (
            <div className="flex items-center justify-between p-2 rounded-lg bg-blue-50 dark:bg-blue-950/20">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-blue-600" />
                <span className="text-sm text-blue-700 dark:text-blue-300">Active tasks</span>
              </div>
              <span className="font-semibold text-blue-700 dark:text-blue-300">{board.stats.activeTasks}</span>
            </div>
          )}

          {board.stats.overdueTasks > 0 && (
            <div className="flex items-center justify-between p-2 rounded-lg bg-red-50 dark:bg-red-950/20">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-red-600" />
                <span className="text-sm text-red-700 dark:text-red-300">Overdue</span>
              </div>
              <span className="font-semibold text-red-700 dark:text-red-300">{board.stats.overdueTasks}</span>
            </div>
          )}
        </div>

        {/* Enhanced Priority Badges */}
        <div className="flex flex-wrap gap-1">
          {board.stats.priorityDistribution.urgent > 0 && (
            <Badge variant="destructive" className="text-xs gap-1 bg-red-500 hover:bg-red-600 shadow-sm">
              <Flag className="h-3 w-3" />
              {board.stats.priorityDistribution.urgent} urgent
            </Badge>
          )}
          {board.stats.priorityDistribution.high > 0 && (
            <Badge variant="secondary" className="text-xs gap-1 bg-orange-100 text-orange-800 border-orange-200">
              <Flag className="h-3 w-3" />
              {board.stats.priorityDistribution.high} high
            </Badge>
          )}
          {board.stats.completionRate > 75 && (
            <Badge variant="outline" className="text-xs gap-1 border-emerald-200 text-emerald-700 bg-emerald-50">
              <TrendingUp className="h-3 w-3" />
              High progress
            </Badge>
          )}
        </div>

        {/* Last Activity */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground pt-2 border-t border-border/50">
          <Calendar className="h-3 w-3" />
          <span>Updated {new Date(board.stats.lastActivity).toLocaleDateString()}</span>
        </div>

        {/* Enhanced Action Button */}
        <Link href={board.href} className="block">
          <Button 
            className="w-full bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary shadow-md"
            size="lg"
          >
            Open Board
            <ExternalLink className="h-4 w-4 ml-2" />
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}

function GroupsView({ 
  boards, 
  settings, 
  onSettingsChange 
}: { 
  boards: EnhancedBoard[]; 
  settings: ViewSettings;
  onSettingsChange: (settings: ViewSettings) => void;
}) {
  const [groups, setGroups] = useState<BoardGroup[]>([
    { id: 'gaming', name: 'Gaming', boards: [], color: GROUP_COLORS.Gaming, order: 1 },
    { id: 'robotics', name: 'Robotics', boards: [], color: GROUP_COLORS.Robotics, order: 2 },
  ]);
  const [newGroupName, setNewGroupName] = useState('');
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);

  // Organize boards into groups
  const organizedGroups = groups.map(group => ({
    ...group,
    boards: boards.filter(board => board.groupId === group.id)
  }));

  // Unassigned boards
  const unassignedBoards = boards.filter(board => 
    !groups.find(group => group.id === board.groupId)
  );

  const handleCreateGroup = () => {
    if (newGroupName.trim()) {
      const newGroup: BoardGroup = {
        id: newGroupName.toLowerCase().replace(/\s+/g, '-'),
        name: newGroupName,
        boards: [],
        color: GROUP_COLORS.Default,
        order: groups.length + 1
      };
      setGroups([...groups, newGroup]);
      setNewGroupName('');
      setIsCreatingGroup(false);
    }
  };

  const handleDeleteGroup = (groupId: string) => {
    setGroups(groups.filter(g => g.id !== groupId));
  };

  const toggleGroup = (groupId: string) => {
    const collapsed = settings.groupView?.collapsed?.includes(groupId)
      ? settings.groupView.collapsed.filter(id => id !== groupId)
      : [...(settings.groupView?.collapsed || []), groupId];
    
    onSettingsChange({
      ...settings,
      groupView: { 
        ...settings.groupView, 
        collapsed 
      }
    });
  };

  return (
    <div className="h-[70vh] overflow-hidden">
      <div className="flex flex-col h-full">
        {/* Groups Management Header */}
        <div className="mb-4 flex items-center justify-between p-4 bg-muted/20 rounded-lg border">
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
                <Button variant="outline" size="sm" onClick={() => setIsCreatingGroup(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <Button size="sm" onClick={() => setIsCreatingGroup(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Group
              </Button>
            )}
          </div>
        </div>

        {/* Scrollable Groups Container */}
        <div className="flex-1 overflow-x-auto">
          <div className="flex gap-6 h-full min-w-max">
            {/* Existing Groups */}
            {organizedGroups.map((group) => (
              <GroupColumn 
                key={group.id} 
                group={group} 
                isCollapsed={settings.groupView?.collapsed?.includes(group.id) || false}
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
                  order: 999
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
  isUnassigned = false 
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
        "flex-shrink-0 w-80 bg-muted/30 rounded-lg border-2 border-dashed border-transparent transition-all",
        dragOver && "border-primary bg-primary/10"
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
      <div className="p-4 h-full flex flex-col">
        {/* Group Header */}
        <div className="flex items-center justify-between mb-4">
          <div 
            className="flex items-center gap-2 cursor-pointer"
            onClick={onToggle}
          >
            <div 
              className="w-4 h-4 rounded-full"
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
          <div className="flex-1 overflow-y-auto space-y-3">
            {group.boards.map((board) => (
              <DraggableBoardCard key={board.id} board={board} groupColor={group.color} />
            ))}
            
            {group.boards.length === 0 && (
              <div className="h-32 border-2 border-dashed border-muted-foreground/30 rounded-lg flex items-center justify-center text-muted-foreground text-sm">
                Drop boards here
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function DraggableBoardCard({ board, groupColor }: { board: EnhancedBoard; groupColor: string }) {
  const [isDragging, setIsDragging] = useState(false);

  return (
    <Card 
      className={cn(
        "cursor-move transition-all duration-200 border-l-4",
        isDragging ? "scale-105 shadow-lg rotate-1 opacity-75" : "hover:scale-102 hover:shadow-md"
      )}
      style={{ borderLeftColor: groupColor }}
      draggable
      onDragStart={() => setIsDragging(true)}
      onDragEnd={() => setIsDragging(false)}
    >
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <Link 
            href={board.href}
            className="font-medium hover:text-primary transition-colors line-clamp-1"
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
            <Badge variant="destructive" className="text-xs">Urgent</Badge>
          )}
          {board.stats.hasMultipleOverdue && (
            <Badge variant="secondary" className="text-xs bg-orange-100 text-orange-800">Overdue</Badge>
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
        <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 transition-opacity">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onClick={handleEdit} className="flex items-center gap-2">
          <Edit className="h-4 w-4" />
          Edit Board
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleArchive} className="flex items-center gap-2 text-orange-600">
          <Archive className="h-4 w-4" />
          Archive Board
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleDelete} className="flex items-center gap-2 text-destructive">
          <Trash2 className="h-4 w-4" />
          Delete Board
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
} 