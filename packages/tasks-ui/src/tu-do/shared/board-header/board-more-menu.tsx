import {
  Bolt,
  CalendarDays,
  Check,
  CopyCheck,
  Ellipsis,
  PanelLeftClose,
  Plus,
  RefreshCw,
} from '@tuturuuu/icons';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { TOOLBAR_CONTROL_CLASS } from './tone-button';

export interface BoardMoreMenuActions {
  onCreateBoard?: () => void;
  onHideSidebar?: () => void;
  onOpenPlanner?: () => void;
  onOpenSettings?: () => void;
  onPrefetchSettings?: () => void;
  onRefresh?: () => void;
  onToggleSelect?: () => void;
}

/** Less frequent board actions behind one button. */
export function BoardMoreMenu({
  isMultiSelectMode,
  isRefreshing,
  onCreateBoard,
  onHideSidebar,
  onOpenPlanner,
  onOpenSettings,
  onPrefetchSettings,
  onRefresh,
  onToggleSelect,
}: BoardMoreMenuActions & {
  isMultiSelectMode: boolean;
  isRefreshing: boolean;
}) {
  const t = useTranslations();
  const hasBoardActions = Boolean(
    onToggleSelect || onOpenSettings || onRefresh || onHideSidebar
  );
  const hasOtherActions = Boolean(onCreateBoard || onOpenPlanner);
  if (!hasBoardActions && !hasOtherActions) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label={t('ws-task-boards.header.more')}
          className={cn(
            TOOLBAR_CONTROL_CLASS,
            'w-8 bg-background px-0 text-muted-foreground shadow-xs hover:bg-muted hover:text-foreground'
          )}
          onFocus={onPrefetchSettings}
          onPointerEnter={onPrefetchSettings}
          type="button"
        >
          <Ellipsis />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        {onToggleSelect ? (
          <DropdownMenuItem onSelect={onToggleSelect}>
            <CopyCheck />
            {t('common.choose_tasks')}
            <DropdownMenuShortcut>
              {isMultiSelectMode ? (
                <Check className="size-4" />
              ) : (
                t('ws-task-boards.header.shift_click')
              )}
            </DropdownMenuShortcut>
          </DropdownMenuItem>
        ) : null}
        {onOpenSettings ? (
          <DropdownMenuItem onSelect={onOpenSettings}>
            <Bolt />
            {t('ws-task-boards.actions.board_settings')}
          </DropdownMenuItem>
        ) : null}
        {onRefresh ? (
          <DropdownMenuItem disabled={isRefreshing} onSelect={onRefresh}>
            <RefreshCw className={cn(isRefreshing && 'animate-spin')} />
            {t('common.refresh')}
          </DropdownMenuItem>
        ) : null}
        {onHideSidebar ? (
          <DropdownMenuItem onSelect={onHideSidebar}>
            <PanelLeftClose />
            {t('common.hide_sidebar')}
          </DropdownMenuItem>
        ) : null}
        {hasBoardActions && hasOtherActions ? <DropdownMenuSeparator /> : null}
        {onCreateBoard ? (
          <DropdownMenuItem onSelect={onCreateBoard}>
            <Plus />
            {t('ws-task-boards.create_anywhere.action')}
          </DropdownMenuItem>
        ) : null}
        {onOpenPlanner ? (
          <DropdownMenuItem onSelect={onOpenPlanner}>
            <CalendarDays />
            {t('ws-task-plans.planner')}
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
