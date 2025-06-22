'use client';

import { useState } from 'react';
import { CustomDataTable } from '@/components/custom-data-table';
import { TaskBoard } from '@tuturuuu/types/primitives/TaskBoard';
import { Button } from '@tuturuuu/ui/button';
import {
  Columns3,
  Filter,
  LayoutGrid,
  LayoutList,
  RefreshCw,
  Settings2,
  SortAsc,
  BarChart3,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Calendar,
  TrendingUp,
  Users,
  Eye,
  X,
  ArrowRight,
  Target,
  Activity
} from '@tuturuuu/ui/icons';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { projectColumns } from './columns';

interface EnhancedBoardsViewProps {
  data: (TaskBoard & { 
    href: string;
    totalTasks: number;
    completedTasks: number;
    activeTasks: number;
    overdueTasks: number;
    progressPercentage: number;
    highPriorityTasks: number;
    mediumPriorityTasks: number;
    lowPriorityTasks: number;
  })[];
  count: number;
}

export function EnhancedBoardsView({ data, count }: EnhancedBoardsViewProps) {
  const [selectedBoard, setSelectedBoard] = useState<typeof data[0] | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Calculate aggregate metrics for the quick stats
  const totalTasks = data.reduce((sum, board) => sum + board.totalTasks, 0);
  const totalCompleted = data.reduce((sum, board) => sum + board.completedTasks, 0);
  const totalOverdue = data.reduce((sum, board) => sum + board.overdueTasks, 0);
  const totalHighPriority = data.reduce((sum, board) => sum + board.highPriorityTasks, 0);
  const avgProgress = data.length > 0 ? Math.round(data.reduce((sum, board) => sum + board.progressPercentage, 0) / data.length) : 0;

  const handleBoardClick = (board: typeof data[0], e: React.MouseEvent) => {
    e.preventDefault();
    setSelectedBoard(board);
    setSidebarOpen(true);
  };

  const closeSidebar = () => {
    setSidebarOpen(false);
    setSelectedBoard(null);
  };

  return (
    <>
      {/* Enhanced Quick Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <div className="rounded-xl border bg-gradient-to-br from-blue-50 to-blue-100/50 p-4 transition-all hover:shadow-md dark:from-blue-950/20 dark:to-blue-900/10">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-blue-500/10 p-2">
              <Target className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-blue-700 dark:text-blue-300">Total Tasks</p>
              <p className="text-2xl font-bold text-blue-900 dark:text-blue-100">{totalTasks}</p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border bg-gradient-to-br from-green-50 to-green-100/50 p-4 transition-all hover:shadow-md dark:from-green-950/20 dark:to-green-900/10">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-green-500/10 p-2">
              <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-green-700 dark:text-green-300">Completed</p>
              <p className="text-2xl font-bold text-green-900 dark:text-green-100">{totalCompleted}</p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border bg-gradient-to-br from-purple-50 to-purple-100/50 p-4 transition-all hover:shadow-md dark:from-purple-950/20 dark:to-purple-900/10">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-purple-500/10 p-2">
              <TrendingUp className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-purple-700 dark:text-purple-300">Avg Progress</p>
              <p className="text-2xl font-bold text-purple-900 dark:text-purple-100">{avgProgress}%</p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border bg-gradient-to-br from-red-50 to-red-100/50 p-4 transition-all hover:shadow-md dark:from-red-950/20 dark:to-red-900/10">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-red-500/10 p-2">
              <Clock className="h-5 w-5 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-red-700 dark:text-red-300">Overdue</p>
              <p className="text-2xl font-bold text-red-900 dark:text-red-100">{totalOverdue}</p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border bg-gradient-to-br from-orange-50 to-orange-100/50 p-4 transition-all hover:shadow-md dark:from-orange-950/20 dark:to-orange-900/10">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-orange-500/10 p-2">
              <AlertTriangle className="h-5 w-5 text-orange-600 dark:text-orange-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-orange-700 dark:text-orange-300">High Priority</p>
              <p className="text-2xl font-bold text-orange-900 dark:text-orange-100">{totalHighPriority}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content with Tabs */}
      <div className="space-y-6">
        <Tabs defaultValue="table" className="w-full">
          {/* Unified Toolbar */}
          <div className="flex items-center justify-between rounded-lg border bg-muted/30 p-1">
            <div className="flex items-center gap-1">
              {/* View Switcher */}
              <TabsList className="grid grid-cols-2 bg-background shadow-sm">
                <TabsTrigger
                  value="table"
                  className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                >
                  <LayoutList className="h-4 w-4" />
                  <span className="hidden sm:inline">Table</span>
                </TabsTrigger>
                <TabsTrigger
                  value="cards"
                  className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                >
                  <LayoutGrid className="h-4 w-4" />
                  <span className="hidden sm:inline">Cards</span>
                </TabsTrigger>
              </TabsList>
            </div>

            {/* Contextual Actions */}
            <div className="flex items-center gap-1">
              {/* Table View Actions */}
              <TabsContent value="table" className="m-0 data-[state=inactive]:hidden">
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                    <Filter className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                    <SortAsc className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                    <Settings2 className="h-4 w-4" />
                  </Button>
                  <div className="mx-1 h-4 w-px bg-border" />
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                    <Columns3 className="h-4 w-4" />
                  </Button>
                </div>
              </TabsContent>

              {/* Cards View Actions */}
              <TabsContent value="cards" className="m-0 data-[state=inactive]:hidden">
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                    <Filter className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                    <SortAsc className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                    <LayoutGrid className="h-4 w-4" />
                  </Button>
                </div>
              </TabsContent>

              {/* Global Actions */}
              <div className="mx-1 h-4 w-px bg-border" />
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Tab Content */}
          <div className="mt-6">
            {/* Table View */}
            <TabsContent value="table" className="mt-0 space-y-4">
              <CustomDataTable
                columnGenerator={projectColumns}
                namespace="basic-data-table"
                data={data}
                count={count}
                hideToolbar={true}
                defaultVisibility={{
                  id: false,
                  created_at: false,
                }}
              />
            </TabsContent>

            {/* Enhanced Cards View */}
            <TabsContent value="cards" className="mt-0 space-y-4">
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {data.map((board) => (
                  <div
                    key={board.id}
                    className="group relative rounded-xl border bg-card p-6 shadow-sm transition-all duration-200 hover:shadow-lg hover:border-primary/20 hover:-translate-y-1 cursor-pointer"
                    onClick={(e) => handleBoardClick(board, e)}
                  >
                    {/* Board Header */}
                    <div className="mb-4">
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <h3 className="font-semibold text-lg leading-tight line-clamp-2 group-hover:text-primary transition-colors">
                          {board.name}
                        </h3>
                        <div className="flex items-center gap-2">
                          {board.archived && (
                            <span className="inline-flex items-center rounded-full bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
                              Archived
                            </span>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={(e) => {
                              e.stopPropagation();
                              window.location.href = board.href;
                            }}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      
                      {/* Description Preview */}
                      {board.description && (
                        <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                          {board.description}
                        </p>
                      )}
                      
                      {/* Tags */}
                      {board.tags && board.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {board.tags.slice(0, 2).map((tag: string, index: number) => (
                            <span
                              key={index}
                              className="inline-flex items-center rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary"
                            >
                              {tag}
                            </span>
                          ))}
                          {board.tags.length > 2 && (
                            <span className="inline-flex items-center rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
                              +{board.tags.length - 2}
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Progress Section */}
                    <div className="mb-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-muted-foreground">Progress</span>
                        <span className="text-sm font-bold">{board.progressPercentage}%</span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-2">
                        <div 
                          className="bg-gradient-to-r from-primary to-primary/80 rounded-full h-2 transition-all duration-500"
                          style={{ width: `${board.progressPercentage}%` }}
                        />
                      </div>
                    </div>

                    {/* Task Stats Grid */}
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div className="flex items-center gap-2">
                        <div className="rounded-lg bg-blue-500/10 p-2">
                          <BarChart3 className="h-4 w-4 text-blue-500" />
                        </div>
                        <div>
                          <p className="text-lg font-bold">{board.totalTasks}</p>
                          <p className="text-xs text-muted-foreground">Total</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="rounded-lg bg-green-500/10 p-2">
                          <CheckCircle2 className="h-4 w-4 text-green-500" />
                        </div>
                        <div>
                          <p className="text-lg font-bold">{board.completedTasks}</p>
                          <p className="text-xs text-muted-foreground">Done</p>
                        </div>
                      </div>
                    </div>

                    {/* Alert Indicators */}
                    {(board.overdueTasks > 0 || board.highPriorityTasks > 0) && (
                      <div className="flex items-center gap-3 mb-3 p-2 rounded-lg bg-muted/50">
                        {board.overdueTasks > 0 && (
                          <div className="flex items-center gap-1 text-red-600">
                            <Clock className="h-3 w-3" />
                            <span className="text-xs font-medium">{board.overdueTasks} overdue</span>
                          </div>
                        )}
                        {board.highPriorityTasks > 0 && (
                          <div className="flex items-center gap-1 text-orange-600">
                            <AlertTriangle className="h-3 w-3" />
                            <span className="text-xs font-medium">{board.highPriorityTasks} urgent</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Footer */}
                    <div className="flex items-center justify-between text-xs text-muted-foreground pt-3 border-t">
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        <span>{new Date(board.created_at).toLocaleDateString()}</span>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <span className="text-primary font-medium">View Details</span>
                        <ArrowRight className="h-3 w-3 text-primary" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Empty State */}
              {data.length === 0 && (
                <div className="rounded-lg border-2 border-dashed border-muted-foreground/25 p-12 text-center">
                  <LayoutGrid className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
                  <h3 className="mb-2 text-lg font-semibold">No boards found</h3>
                  <p className="text-sm text-muted-foreground">
                    Create your first task board to get started.
                  </p>
                </div>
              )}
            </TabsContent>
          </div>
        </Tabs>
      </div>

      {/* Enhanced Sidebar */}
      {sidebarOpen && selectedBoard && (
        <div className="fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/20 backdrop-blur-sm"
            onClick={closeSidebar}
          />
          
          {/* Sidebar */}
          <div className="relative ml-auto h-full w-full max-w-md bg-background shadow-2xl">
            <div className="flex h-full flex-col">
              {/* Header */}
              <div className="flex items-center justify-between border-b p-6">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-primary/10 p-2">
                    <LayoutGrid className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h2 className="font-semibold">Board Details</h2>
                    <p className="text-sm text-muted-foreground">Quick overview</p>
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={closeSidebar}>
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {/* Board Info */}
                <div>
                  <h3 className="font-semibold text-lg mb-2">{selectedBoard.name}</h3>
                  {selectedBoard.description && (
                    <p className="text-sm text-muted-foreground mb-4">
                      {selectedBoard.description}
                    </p>
                  )}
                  
                  {/* Tags */}
                  {selectedBoard.tags && selectedBoard.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {selectedBoard.tags.map((tag: string, index: number) => (
                        <span
                          key={index}
                          className="inline-flex items-center rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Progress Overview */}
                <div className="rounded-lg border p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-medium">Overall Progress</h4>
                    <span className="text-2xl font-bold text-primary">{selectedBoard.progressPercentage}%</span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-3 mb-3">
                    <div 
                      className="bg-gradient-to-r from-primary to-primary/80 rounded-full h-3 transition-all duration-500"
                      style={{ width: `${selectedBoard.progressPercentage}%` }}
                    />
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {selectedBoard.completedTasks} of {selectedBoard.totalTasks} tasks completed
                  </div>
                </div>

                {/* Task Breakdown */}
                <div className="space-y-3">
                  <h4 className="font-medium">Task Breakdown</h4>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-lg border p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <BarChart3 className="h-4 w-4 text-blue-500" />
                        <span className="text-sm font-medium">Total</span>
                      </div>
                      <p className="text-2xl font-bold">{selectedBoard.totalTasks}</p>
                    </div>
                    
                    <div className="rounded-lg border p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        <span className="text-sm font-medium">Completed</span>
                      </div>
                      <p className="text-2xl font-bold">{selectedBoard.completedTasks}</p>
                    </div>
                    
                    <div className="rounded-lg border p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <Activity className="h-4 w-4 text-blue-500" />
                        <span className="text-sm font-medium">Active</span>
                      </div>
                      <p className="text-2xl font-bold">{selectedBoard.activeTasks}</p>
                    </div>
                    
                    <div className="rounded-lg border p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <Clock className="h-4 w-4 text-red-500" />
                        <span className="text-sm font-medium">Overdue</span>
                      </div>
                      <p className="text-2xl font-bold">{selectedBoard.overdueTasks}</p>
                    </div>
                  </div>
                </div>

                {/* Priority Breakdown */}
                {(selectedBoard.highPriorityTasks > 0 || selectedBoard.mediumPriorityTasks > 0 || selectedBoard.lowPriorityTasks > 0) && (
                  <div className="space-y-3">
                    <h4 className="font-medium">Priority Breakdown</h4>
                    
                    <div className="space-y-2">
                      {selectedBoard.highPriorityTasks > 0 && (
                        <div className="flex items-center justify-between p-2 rounded-lg bg-red-50 dark:bg-red-950/20">
                          <div className="flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4 text-red-500" />
                            <span className="text-sm font-medium">High Priority</span>
                          </div>
                          <span className="font-bold">{selectedBoard.highPriorityTasks}</span>
                        </div>
                      )}
                      
                      {selectedBoard.mediumPriorityTasks > 0 && (
                        <div className="flex items-center justify-between p-2 rounded-lg bg-orange-50 dark:bg-orange-950/20">
                          <div className="flex items-center gap-2">
                            <Clock className="h-4 w-4 text-orange-500" />
                            <span className="text-sm font-medium">Medium Priority</span>
                          </div>
                          <span className="font-bold">{selectedBoard.mediumPriorityTasks}</span>
                        </div>
                      )}
                      
                      {selectedBoard.lowPriorityTasks > 0 && (
                        <div className="flex items-center justify-between p-2 rounded-lg bg-green-50 dark:bg-green-950/20">
                          <div className="flex items-center gap-2">
                            <Target className="h-4 w-4 text-green-500" />
                            <span className="text-sm font-medium">Low Priority</span>
                          </div>
                          <span className="font-bold">{selectedBoard.lowPriorityTasks}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Board Meta */}
                <div className="space-y-3">
                  <h4 className="font-medium">Board Information</h4>
                  
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Created</span>
                      <span>{new Date(selectedBoard.created_at).toLocaleDateString()}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Status</span>
                      <span className={selectedBoard.archived ? "text-muted-foreground" : "text-green-600"}>
                        {selectedBoard.archived ? "Archived" : "Active"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer Actions */}
              <div className="border-t p-6">
                <div className="flex gap-2">
                  <Button 
                    className="flex-1"
                    onClick={() => window.location.href = selectedBoard.href}
                  >
                    <Eye className="h-4 w-4 mr-2" />
                    Open Board
                  </Button>
                  <Button variant="outline" onClick={closeSidebar}>
                    Close
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
} 