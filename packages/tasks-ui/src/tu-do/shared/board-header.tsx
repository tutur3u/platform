import { ArrowLeft, Plus, Share2, UserStar, X, Zap } from '@tuturuuu/icons';
import type { WorkspaceTaskBoard } from '@tuturuuu/types';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { Button } from '@tuturuuu/ui/button';
import { useOptionalSidebar } from '@tuturuuu/ui/custom/sidebar-context';
import { cn } from '@tuturuuu/utils/format';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { BoardShareDialog } from '../boards/board-share-dialog';
import { KanbanPlannerDialog } from '../boards/boardId/kanban/planner/kanban-planner-dialog';
import type { TaskFilters } from '../boards/boardId/task-filter';
import { CreateBoardAnywhereDialog } from '../boards/create-board-anywhere-dialog';
import { getActiveBoardRefresh } from './board-broadcast-context';
import { saveBoardConfig } from './board-config-storage';
import {
  type BoardPerson,
  clearBoardFilters,
  hasActiveBoardFilters,
  isFocusActive,
  type ListStatusFilter,
  toggleFocus,
} from './board-header/board-filter-state';
import { BoardMoreMenu } from './board-header/board-more-menu';
import { BoardPeopleFilter } from './board-header/board-people-filter';
import { BoardProjectFilter } from './board-header/board-project-filter';
import { BoardSearchInput } from './board-header/board-search-input';
import { BoardSortMenu } from './board-header/board-sort-menu';
import { BoardViewMenu } from './board-header/board-view-menu';
import { ToneButton } from './board-header/tone-button';
import { useOpenBoardSettings } from './board-header/use-open-board-settings';
import { BoardSwitcher } from './board-switcher';
import { BoardUserPresenceAvatarsComponent } from './board-user-presence-avatars';
import type { ViewType } from './board-views';
import type { BoardFiltersMetadata } from './task-filter.types';

export type { ListStatusFilter } from './board-header/board-filter-state';

interface Props {
  workspaceId: string;
  board: Pick<
    WorkspaceTaskBoard,
    'id' | 'name' | 'ticket_prefix' | 'archived_at'
  > & {
    access_type?: 'member' | 'guest';
    ws_id?: WorkspaceTaskBoard['ws_id'] | null;
    icon?: WorkspaceTaskBoard['icon'];
    default_list_id?: WorkspaceTaskBoard['default_list_id'] | null;
    has_guest_access?: boolean;
  };
  currentUserId?: string;
  currentView: ViewType;
  onViewChange: (view: ViewType) => void;
  viewHotkeyLabels?: Partial<Record<ViewType, string>>;
  filters: TaskFilters;
  onFiltersChange: (filters: TaskFilters) => void;
  listStatusFilter: ListStatusFilter;
  onListStatusFilterChange: (filter: ListStatusFilter) => void;
  isPersonalWorkspace: boolean;
  backUrl?: string;
  hideActions?: boolean;
  isSearching?: boolean;
  lists?: TaskList[];
  onUpdate?: () => void;
  onRecycleBinOpen?: () => void;
  isMultiSelectMode: boolean;
  setIsMultiSelectMode: (enabled: boolean) => void;
  availableViews?: ViewType[];
  publicView?: boolean;
  readOnly?: boolean;
  titlePrefix?: ReactNode;
  onBoardSettingsIntent?: () => void;
  /** People pills; omitted hides them (for example on project pages). */
  people?: BoardPerson[];
  unassignedCount?: number;
  /** Board task count per project; omitted hides the Project filter. */
  projectTaskCounts?: Map<string, number>;
  countsComplete?: boolean;
  onCreateTask?: () => void;
  /** Sprint pill shown after the board in the breadcrumb. */
  sprintSlot?: ReactNode;
  /** Plan | Board tabs, shown first in the second row on sprint boards. */
  planTabs?: ReactNode;
  /** The Plan tab is open, so board-only controls hide. */
  planActive?: boolean;
}

export function BoardHeader({
  workspaceId,
  board,
  currentUserId,
  currentView,
  onViewChange,
  viewHotkeyLabels,
  filters,
  onFiltersChange,
  listStatusFilter,
  onListStatusFilterChange,
  isPersonalWorkspace,
  backUrl,
  hideActions = false,
  isSearching = false,
  isMultiSelectMode,
  setIsMultiSelectMode,
  availableViews,
  publicView = false,
  readOnly = false,
  titlePrefix,
  onBoardSettingsIntent,
  onUpdate,
  people,
  unassignedCount = 0,
  projectTaskCounts,
  countsComplete = true,
  onCreateTask,
  sprintSlot,
  planTabs,
  planActive = false,
}: Props) {
  const t = useTranslations();
  const [shareBoardOpen, setShareBoardOpen] = useState(false);
  const [plannerOpen, setPlannerOpen] = useState(false);
  const [createBoardOpen, setCreateBoardOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const enabledViews = availableViews ?? ['kanban', 'list', 'timeline'];
  const interactiveControlsVisible = !readOnly;
  const managerControlsVisible = !hideActions && !readOnly;
  const plannerVisible =
    interactiveControlsVisible &&
    !publicView &&
    isPersonalWorkspace &&
    currentView === 'kanban';
  const sidebar = useOptionalSidebar();
  const hideSidebarVisible =
    Boolean(sidebar) && sidebar?.behavior !== 'hidden' && !publicView;
  const hasSharedBoardGuests =
    board.access_type === 'guest' || board.has_guest_access === true;
  const presenceVisible =
    interactiveControlsVisible &&
    (!isPersonalWorkspace || hasSharedBoardGuests);
  const currentUser = currentUserId
    ? (people?.find((person) => person.id === currentUserId) ?? {
        id: currentUserId,
        display_name: null,
        avatar_url: null,
        email: null,
      })
    : undefined;
  const { openBoardSettings, prefetchBoardSettings } = useOpenBoardSettings({
    boardId: board.id,
    enabled: managerControlsVisible,
    onBoardSettingsIntent,
    workspaceId,
  });
  const focusOn = isFocusActive(filters, listStatusFilter, currentUserId);
  const filtersActive = hasActiveBoardFilters(filters, listStatusFilter);

  // Save board configuration to localStorage when it changes (excluding search)
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      const { searchQuery: _, ...filtersToSave } = filters;
      saveBoardConfig(board.id, {
        currentView,
        filters: filtersToSave,
        listStatusFilter,
      });
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [board.id, currentView, filters, listStatusFilter]);

  const presenceMetadata: BoardFiltersMetadata = useMemo(() => {
    const { searchQuery: _, ...filtersWithoutSearch } = filters;
    return { filters: filtersWithoutSearch, listStatusFilter };
  }, [filters, listStatusFilter]);

  function handleSearchChange(searchQuery: string | undefined) {
    onFiltersChange({ ...filters, searchQuery });
    // Timeline cannot show search results, so searching opens List.
    if (searchQuery && currentView === 'timeline') onViewChange('list');
  }

  async function refreshBoard() {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      await getActiveBoardRefresh()?.({ includeLists: true });
      onUpdate?.();
    } finally {
      setIsRefreshing(false);
    }
  }

  function handleFocus() {
    const next = toggleFocus({ currentUser, filters, listStatusFilter });
    onFiltersChange(next.filters);
    onListStatusFilterChange(next.listStatusFilter);
  }

  function handleClear() {
    onFiltersChange(clearBoardFilters(filters));
    onListStatusFilterChange('all');
  }

  const title = publicView ? (
    <div className="flex min-w-0 items-center gap-2">
      {titlePrefix}
      <h1 className="truncate font-medium text-foreground text-sm">
        {board.name || t('common.untitled')}
      </h1>
    </div>
  ) : currentView === 'my_tasks' ? (
    <div className="flex h-8 min-w-0 items-center gap-2 rounded-md px-2 text-foreground">
      <UserStar className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="truncate font-medium text-sm">
        {t('ws-task-boards.views.my_tasks')}
      </span>
    </div>
  ) : (
    <BoardSwitcher
      board={{ ...board, ws_id: workspaceId }}
      className="w-auto max-w-[min(22rem,60vw)] [&_button]:h-8 [&_button]:min-h-8 [&_button]:border-transparent [&_button]:bg-transparent [&_button]:px-2 [&_button]:shadow-none hover:[&_button]:bg-muted"
      translations={{
        loadingBoards: t('common.loading'),
        noOtherBoards: t('common.no_other_boards'),
        activeBoards: t('common.active_boards'),
        archivedBoards: t('common.archived_boards'),
        deletedBoards: t('common.deleted_boards'),
        untitled: t('common.untitled'),
        active: t('common.active'),
        archived: t('common.archived'),
        deleted: t('common.deleted'),
        daysLeft: t('common.days_left', { count: '{count}' }),
        searchBoards: t('common.search_boards'),
        tasks: t('common.tasks'),
        createBoard: t('ws-task-boards.create'),
        creatingBoard: t('common.creating'),
        createBoardError: t('ws-task-boards.errors.unexpected'),
      }}
    />
  );

  return (
    // Three fixed lines that never wrap: as the header narrows, the least
    // needed parts hide or drop to icons instead of moving to a new line.
    <div
      className="@container/board-header -mt-2 flex flex-col gap-2 border-b p-2"
      data-board-header
    >
      <div className="flex min-w-0 items-center gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
          {backUrl ? (
            <Link
              aria-label={t('common.back')}
              className="text-muted-foreground transition-colors hover:text-foreground"
              href={backUrl}
            >
              <ArrowLeft className="size-5" />
            </Link>
          ) : null}
          <div className="min-w-9 shrink overflow-hidden">{title}</div>
          {sprintSlot && !publicView && currentView !== 'my_tasks' ? (
            <>
              <span
                aria-hidden="true"
                className="-mx-1 text-lg text-muted-foreground"
              >
                /
              </span>
              {sprintSlot}
            </>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {presenceVisible ? (
            <div className="@xl/board-header:block hidden">
              <BoardUserPresenceAvatarsComponent
                boardId={board.id}
                currentMetadata={presenceMetadata}
                onFiltersChange={onFiltersChange}
                onListStatusFilterChange={onListStatusFilterChange}
              />
            </div>
          ) : null}
          {managerControlsVisible ? (
            <ToneButton
              aria-label={t('ws-task-boards.header.share')}
              onClick={() => setShareBoardOpen(true)}
              tone="neutral"
            >
              <Share2 />
              <span className="@2xl/board-header:inline hidden">
                {t('ws-task-boards.header.share')}
              </span>
            </ToneButton>
          ) : null}
          {interactiveControlsVisible && onCreateTask ? (
            <Button
              aria-label={t('ws-task-boards.header.new_task')}
              className="h-8"
              onClick={onCreateTask}
              size="sm"
            >
              <Plus />
              <span className="@lg/board-header:inline hidden">
                {t('ws-task-boards.header.new_task')}
              </span>
            </Button>
          ) : null}
          <BoardMoreMenu
            isMultiSelectMode={isMultiSelectMode}
            isRefreshing={isRefreshing}
            onCreateBoard={
              interactiveControlsVisible && !publicView
                ? () => setCreateBoardOpen(true)
                : undefined
            }
            onHideSidebar={
              hideSidebarVisible
                ? () => sidebar?.handleBehaviorChange('hidden')
                : undefined
            }
            onOpenPlanner={
              plannerVisible ? () => setPlannerOpen(true) : undefined
            }
            onOpenSettings={
              managerControlsVisible ? openBoardSettings : undefined
            }
            onPrefetchSettings={prefetchBoardSettings}
            onRefresh={
              interactiveControlsVisible ? () => void refreshBoard() : undefined
            }
            onToggleSelect={
              interactiveControlsVisible
                ? () => setIsMultiSelectMode(!isMultiSelectMode)
                : undefined
            }
          />
        </div>
      </div>
      <div className="flex min-w-0 items-center gap-2">
        {planTabs}
        {planActive ? null : (
          <>
            <BoardSearchInput
              isSearching={isSearching}
              onSearchChange={handleSearchChange}
              searchQuery={filters.searchQuery}
            />
            <div className="ml-auto flex shrink-0 items-center gap-2">
              <BoardSortMenu
                onChange={(sortBy) => onFiltersChange({ ...filters, sortBy })}
                sortBy={filters.sortBy}
              />
              <BoardViewMenu
                availableViews={enabledViews}
                currentView={currentView}
                hotkeyLabels={viewHotkeyLabels}
                onViewChange={onViewChange}
              />
            </div>
          </>
        )}
      </div>
      {/* Filters get their own row so people pills keep their names. */}
      {planActive || !interactiveControlsVisible ? null : (
        <div className="flex min-w-0 items-center gap-2">
          {people ? (
            <BoardPeopleFilter
              currentUserId={currentUserId}
              filters={filters}
              onFiltersChange={onFiltersChange}
              people={people}
              unassignedCount={unassignedCount}
              countsComplete={countsComplete}
            />
          ) : null}
          {projectTaskCounts ? (
            <BoardProjectFilter
              filters={filters}
              onFiltersChange={onFiltersChange}
              projectTaskCounts={projectTaskCounts}
              countsComplete={countsComplete}
              workspaceId={workspaceId}
            />
          ) : null}
          {currentUserId ? (
            <ToneButton
              active={focusOn}
              aria-label={t('ws-task-boards.header.focus')}
              aria-pressed={focusOn}
              onClick={handleFocus}
              title={t('ws-task-boards.header.focus_hint')}
              tone="neutral"
            >
              <Zap className={cn(focusOn && 'fill-current')} />
              <span className="@2xl/board-header:inline hidden">
                {t('ws-task-boards.header.focus')}
              </span>
            </ToneButton>
          ) : null}
          {filtersActive ? (
            <Button
              className="h-8 text-muted-foreground"
              onClick={handleClear}
              size="sm"
              variant="ghost"
            >
              <X />
              {t('common.clear')}
            </Button>
          ) : null}
        </div>
      )}
      <BoardShareDialog
        board={{ id: board.id, name: board.name }}
        open={shareBoardOpen}
        onOpenChange={setShareBoardOpen}
        wsId={workspaceId}
      />
      {interactiveControlsVisible && !publicView ? (
        <CreateBoardAnywhereDialog
          currentWorkspaceId={workspaceId}
          onOpenChange={setCreateBoardOpen}
          open={createBoardOpen}
        />
      ) : null}
      {plannerVisible ? (
        <KanbanPlannerDialog
          boardId={board.id}
          isPersonalWorkspace={isPersonalWorkspace}
          onOpenChange={setPlannerOpen}
          open={plannerOpen}
          workspaceId={workspaceId}
        />
      ) : null}
    </div>
  );
}
