'use client';

import {
  Archive,
  ArrowRight,
  Calendar,
  Copy,
  Eye,
  LayoutGrid,
  RefreshCw,
  Trash2,
} from '@tuturuuu/icons';
import type { WorkspaceTaskBoard } from '@tuturuuu/types';
import { Button } from '@tuturuuu/ui/button';
import { CustomDataTable } from '@tuturuuu/ui/custom/tables/custom-data-table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { TabsContent } from '@tuturuuu/ui/tabs';
import { projectColumns } from './columns';

type CardLayout = 'grid-cols-1' | 'grid-cols-2' | 'grid-cols-3';

interface AnalyticsFilters {
  timeView: 'week' | 'month' | 'year';
  selectedBoard: string | null;
  statusFilter: 'all' | 'not_started' | 'active' | 'done' | 'closed';
}

interface BoardViewsProps {
  filteredData: WorkspaceTaskBoard[];
  count: number;
  hasActiveFilters: boolean;
  isPersonal?: boolean;
  wsId: string;
  cardLayout: CardLayout;
  openCopyBoardModal: (board: WorkspaceTaskBoard) => void;
  restoreBoard: (wsId: string, boardId: string) => void;
  permanentDeleteBoard: (wsId: string, boardId: string) => void;
  unarchiveBoard: (wsId: string, boardId: string) => void;
  archiveBoard: (wsId: string, boardId: string) => void;
  softDeleteBoard: (wsId: string, boardId: string) => void;
  calculateDaysRemaining: (deletedAt: string | null) => number | null;
  analyticsFilters: AnalyticsFilters;
  setAnalyticsFilters: (
    updater: (prev: AnalyticsFilters) => AnalyticsFilters
  ) => void;
  safeData: WorkspaceTaskBoard[];
}

export function BoardViews({
  filteredData,
  count,
  hasActiveFilters,
  isPersonal,
  wsId,
  cardLayout,
  openCopyBoardModal,
  restoreBoard,
  permanentDeleteBoard,
  unarchiveBoard,
  archiveBoard,
  softDeleteBoard,
  calculateDaysRemaining,
  analyticsFilters,
  setAnalyticsFilters,
  safeData,
}: BoardViewsProps) {
  return (
    <div className="mt-6">
      <TabsContent value="table" className="mt-0 space-y-4">
        <CustomDataTable
          columnGenerator={(t, ns, _, extraData) =>
            projectColumns(t, ns, extraData?.isPersonal, extraData?.wsId)
          }
          extraData={{ isPersonal, wsId }}
          namespace="basic-data-table"
          data={filteredData}
          count={hasActiveFilters ? filteredData.length : count}
          hideToolbar={true}
          defaultVisibility={{
            id: false,
            created_at: false,
          }}
        />
      </TabsContent>

      <TabsContent value="cards" className="mt-0 space-y-4">
        <div
          className={`grid grid-cols-1 gap-6 sm:${cardLayout} lg:${cardLayout}`}
        >
          {filteredData.map((board) => (
            <div
              key={board.id}
              className="group hover:-translate-y-1 relative w-full cursor-pointer rounded-xl border bg-card p-6 text-left shadow-sm transition-all duration-200 hover:border-primary/20 hover:shadow-lg"
              onClick={() => {
                if (!board.href) return;
                window.location.href = board.href;
              }}
            >
              <div className="mb-4">
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <h3 className="line-clamp-2 font-semibold text-lg leading-tight transition-colors group-hover:text-primary">
                      {board.name}
                    </h3>
                  </div>
                  <div className="flex items-center gap-2">
                    {board.archived_at && (
                      <span className="inline-flex items-center rounded-full bg-muted px-2 py-1 font-medium text-muted-foreground text-xs">
                        Archived
                      </span>
                    )}
                    {board.deleted_at && (
                      <span className="inline-flex items-center rounded-full bg-destructive/10 px-2 py-1 font-medium text-destructive text-xs">
                        Deleted — {calculateDaysRemaining(board.deleted_at)}{' '}
                        days left
                      </span>
                    )}
                    <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          openCopyBoardModal(board);
                        }}
                        title="Copy"
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      {board.deleted_at ? (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              restoreBoard(board.ws_id, board.id);
                            }}
                            title="Restore board"
                          >
                            <RefreshCw className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10"
                            onClick={(e) => {
                              e.stopPropagation();
                              permanentDeleteBoard(board.ws_id, board.id);
                            }}
                            title="Delete permanently"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </>
                      ) : board.archived_at ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            unarchiveBoard(board.ws_id, board.id);
                          }}
                          title="Unarchive board"
                        >
                          <RefreshCw className="h-4 w-4" />
                        </Button>
                      ) : (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              archiveBoard(board.ws_id, board.id);
                            }}
                            title="Archive board"
                          >
                            <Archive className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10"
                            onClick={(e) => {
                              e.stopPropagation();
                              softDeleteBoard(board.ws_id, board.id);
                            }}
                            title="Delete board"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!board.href) return;
                          window.location.href = board.href;
                        }}
                        title="View board"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between border-t pt-3 text-muted-foreground text-xs">
                {board.created_at && (
                  <div className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    <span>
                      {new Date(board.created_at).toLocaleDateString()}
                    </span>
                  </div>
                )}
                <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <span className="font-medium text-primary">View Details</span>
                  <ArrowRight className="h-3 w-3 text-primary" />
                </div>
              </div>
            </div>
          ))}
        </div>

        {safeData.length === 0 && (
          <div className="rounded-lg border-2 border-muted-foreground/25 border-dashed p-12 text-center">
            <LayoutGrid className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
            <h3 className="mb-2 font-semibold text-lg">No boards found</h3>
            <p className="text-muted-foreground text-sm">
              Create your first task board to get started.
            </p>
          </div>
        )}
      </TabsContent>

      <TabsContent value="analytics" className="mt-0 space-y-4">
        <div className="space-y-6 pb-8">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-lg">
                Task Timeline & Performance
              </h3>
              <p className="text-muted-foreground text-sm">
                {analyticsFilters.selectedBoard
                  ? `Metrics for ${
                      safeData.find(
                        (b: WorkspaceTaskBoard) =>
                          b.id === analyticsFilters.selectedBoard
                      )?.name || 'Selected Board'
                    }`
                  : 'Aggregate metrics across all boards'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Select
                value={analyticsFilters.statusFilter}
                onValueChange={(value) =>
                  setAnalyticsFilters((prev) => ({
                    ...prev,
                    statusFilter: value as
                      | 'all'
                      | 'not_started'
                      | 'active'
                      | 'done'
                      | 'closed',
                  }))
                }
              >
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">📋 All Tasks</SelectItem>
                  <SelectItem value="not_started">⏸️ Not Started</SelectItem>
                  <SelectItem value="active">🔄 Active</SelectItem>
                  <SelectItem value="done">✅ Done</SelectItem>
                  <SelectItem value="closed">🔒 Closed</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={analyticsFilters.timeView}
                onValueChange={(value) =>
                  setAnalyticsFilters((prev) => ({
                    ...prev,
                    timeView: value as 'week' | 'month' | 'year',
                  }))
                }
              >
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="week">Week</SelectItem>
                  <SelectItem value="month">Month</SelectItem>
                  <SelectItem value="year">Year</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={analyticsFilters.selectedBoard || 'all'}
                onValueChange={(value) =>
                  setAnalyticsFilters((prev) => ({
                    ...prev,
                    selectedBoard: value === 'all' ? null : value,
                  }))
                }
              >
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Boards</SelectItem>
                  {safeData.map((board: WorkspaceTaskBoard) => (
                    <SelectItem key={board.id} value={board.id}>
                      {board.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </TabsContent>
    </div>
  );
}
