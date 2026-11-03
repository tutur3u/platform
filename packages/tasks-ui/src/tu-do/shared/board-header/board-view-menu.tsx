import {
  CalendarDays,
  ChevronDown,
  KanbanSquare,
  List,
  Pencil,
  Trash2,
  UserStar,
} from '@tuturuuu/icons';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { useTranslations } from 'next-intl';
import type { ViewType } from '../board-views';
import { ToneButton } from './tone-button';
import { ToolbarMenuItem } from './toolbar-menu-item';

const VIEW_ICONS: Record<ViewType, typeof KanbanSquare> = {
  kanban: KanbanSquare,
  list: List,
  timeline: CalendarDays,
  my_tasks: UserStar,
  drafts: Pencil,
  recycle_bin: Trash2,
};

const VIEW_ORDER: ViewType[] = [
  'kanban',
  'list',
  'timeline',
  'my_tasks',
  'drafts',
  'recycle_bin',
];

export function BoardViewMenu({
  availableViews,
  currentView,
  hotkeyLabels,
  onViewChange,
}: {
  availableViews: ViewType[];
  currentView: ViewType;
  hotkeyLabels?: Partial<Record<ViewType, string>>;
  onViewChange: (view: ViewType) => void;
}) {
  const t = useTranslations();
  const copy: Record<ViewType, { label: string; description: string }> = {
    kanban: {
      label: t('ws-task-boards.views.kanban'),
      description: t('ws-task-boards.views.kanban_description'),
    },
    list: {
      label: t('ws-task-boards.views.list'),
      description: t('ws-task-boards.views.list_description'),
    },
    timeline: {
      label: t('ws-task-boards.views.timeline'),
      description: t('ws-task-boards.views.timeline_description'),
    },
    my_tasks: {
      label: t('ws-task-boards.views.my_tasks'),
      description: t('ws-task-boards.views.my_tasks_description'),
    },
    drafts: {
      label: t('task-drafts.title'),
      description: t('task-drafts.board_view_description'),
    },
    recycle_bin: {
      label: t('common.recycle_bin'),
      description: t('common.recycle_bin_board_description'),
    },
  };
  const views = VIEW_ORDER.filter((view) => availableViews.includes(view));
  const activeView = views.includes(currentView)
    ? currentView
    : (views[0] ?? 'kanban');
  const ActiveIcon = VIEW_ICONS[activeView];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <ToneButton
          active={activeView !== 'kanban'}
          aria-label={`${t('common.view')}: ${copy[activeView].label}`}
          tone="purple"
        >
          <ActiveIcon />
          {copy[activeView].label}
          <ChevronDown className="opacity-60" />
        </ToneButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        {views.map((view) => {
          const Icon = VIEW_ICONS[view];
          return (
            <ToolbarMenuItem
              key={view}
              checked={view === activeView}
              description={copy[view].description}
              hint={hotkeyLabels?.[view]}
              icon={<Icon />}
              label={copy[view].label}
              onSelect={() => onViewChange(view)}
            />
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
