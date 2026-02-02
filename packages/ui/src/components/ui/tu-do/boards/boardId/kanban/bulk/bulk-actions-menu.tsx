'use client';

import {
  Box,
  Calendar,
  Check,
  CheckCircle2,
  CircleDashed,
  CircleFadingArrowUpIcon,
  CircleSlash,
  Flag,
  horseHead,
  Icon,
  List,
  Move,
  Plus,
  Rabbit,
  Search,
  Tags,
  Timer,
  Trash2,
  Turtle,
  UserStar,
  unicornHead,
  X,
} from '@tuturuuu/icons';
import type { Workspace } from '@tuturuuu/types';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { Input } from '@tuturuuu/ui/input';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { mapEstimationPoints } from '../../../../shared/estimation-mapping';

interface BulkActionsMenuProps {
  workspace: Workspace;
  boardConfig: any;
  columns: TaskList[];
  bulkWorking: boolean;
  estimationOptions: number[];
  appliedSets: {
    labels: Set<string>;
    projects: Set<string>;
    assignees: Set<string>;
  };
  filtered: {
    labels: any[];
    projects: any[];
    members: any[];
  };
  search: {
    labelQuery: string;
    setLabelQuery: (q: string) => void;
    projectQuery: string;
    setProjectQuery: (q: string) => void;
    assigneeQuery: string;
    setAssigneeQuery: (q: string) => void;
  };
  actions: {
    bulkMoveToStatus: (status: string) => void;
    bulkUpdatePriority: (priority: string | null) => void;
    bulkUpdateDueDate: (type: string) => void;
    bulkUpdateEstimation: (points: number | null) => void;
    bulkAddLabel: (id: string) => void;
    bulkRemoveLabel: (id: string) => void;
    bulkClearLabels: () => void;
    bulkAddProject: (id: string) => void;
    bulkRemoveProject: (id: string) => void;
    bulkClearProjects: () => void;
    bulkMoveToList: (listId: string, listName: string) => void;
    bulkAddAssignee: (id: string) => void;
    bulkRemoveAssignee: (id: string) => void;
    bulkClearAssignees: () => void;
  };
  onOpenCustomDate: () => void;
  onConfirmDelete: () => void;
}

export function BulkActionsMenu({
  workspace,
  boardConfig,
  columns,
  bulkWorking,
  estimationOptions,
  appliedSets,
  filtered,
  search,
  actions,
  onOpenCustomDate,
  onConfirmDelete,
}: BulkActionsMenuProps) {
  const t = useTranslations();
  const tc = useTranslations('common');

  return (
    <DropdownMenuContent
      align="end"
      className="w-56"
      sideOffset={5}
      onClick={(e) => {
        e.stopPropagation();
      }}
    >
      {/* Quick Completion Actions */}
      {columns.some((c) => c.status === 'done') && (
        <DropdownMenuItem
          disabled={bulkWorking}
          onClick={() => actions.bulkMoveToStatus('done')}
          className="cursor-pointer"
        >
          <CheckCircle2 className="h-4 w-4 text-dynamic-green" />
          {t('common.mark_as_done')}
        </DropdownMenuItem>
      )}
      {columns.some((c) => c.status === 'closed') && (
        <DropdownMenuItem
          disabled={bulkWorking}
          onClick={() => actions.bulkMoveToStatus('closed')}
          className="cursor-pointer"
        >
          <CircleSlash className="h-4 w-4 text-dynamic-purple" />
          {t('common.mark_as_closed')}
        </DropdownMenuItem>
      )}
      {(columns.some((c) => c.status === 'done') ||
        columns.some((c) => c.status === 'closed')) && (
        <DropdownMenuSeparator />
      )}

      {/* Priority Menu */}
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>
          <Flag className="h-4 w-4 text-dynamic-red" />
          {t('common.priority')}
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="w-40">
          <DropdownMenuItem
            disabled={bulkWorking}
            onClick={() => actions.bulkUpdatePriority('critical')}
            className="cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <div className="flex h-5 w-5 items-center justify-center rounded bg-dynamic-red/10">
                <Icon
                  iconNode={unicornHead}
                  className="h-3.5 w-3.5 text-dynamic-red"
                />
              </div>
              <span>{t('tasks.priority_critical')}</span>
            </div>
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={bulkWorking}
            onClick={() => actions.bulkUpdatePriority('high')}
            className="cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <div className="flex h-5 w-5 items-center justify-center rounded bg-dynamic-orange/10">
                <Icon
                  iconNode={horseHead}
                  className="h-3.5 w-3.5 text-dynamic-orange"
                />
              </div>
              <span>{t('tasks.priority_high')}</span>
            </div>
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={bulkWorking}
            onClick={() => actions.bulkUpdatePriority('normal')}
            className="cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <div className="flex h-5 w-5 items-center justify-center rounded bg-dynamic-yellow/10">
                <Rabbit className="h-3.5 w-3.5 text-dynamic-yellow" />
              </div>
              <span>{t('tasks.priority_normal')}</span>
            </div>
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={bulkWorking}
            onClick={() => actions.bulkUpdatePriority('low')}
            className="cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <div className="flex h-5 w-5 items-center justify-center rounded bg-dynamic-blue/10">
                <Turtle className="h-3.5 w-3.5 text-dynamic-blue" />
              </div>
              <span>{t('tasks.priority_low')}</span>
            </div>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={bulkWorking}
            onClick={() => actions.bulkUpdatePriority(null)}
            className="cursor-pointer text-muted-foreground"
          >
            <X className="h-4 w-4" />
            {t('tasks.priority_none')}
          </DropdownMenuItem>
        </DropdownMenuSubContent>
      </DropdownMenuSub>

      {/* Due Date Menu */}
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>
          <div className="h-4 w-4">
            <Calendar className="h-4 w-4 text-dynamic-purple" />
          </div>
          <div className="flex w-full items-center justify-between">
            <span>{tc('due_date')}</span>
          </div>
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          <DropdownMenuItem
            disabled={bulkWorking}
            onClick={() => actions.bulkUpdateDueDate('today')}
            className="cursor-pointer"
          >
            <Calendar className="h-4 w-4 text-dynamic-green" />
            {t('common.today')}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={bulkWorking}
            onClick={() => actions.bulkUpdateDueDate('tomorrow')}
            className="cursor-pointer"
          >
            <Calendar className="h-4 w-4 text-dynamic-blue" />
            {t('common.tomorrow')}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={bulkWorking}
            onClick={() => actions.bulkUpdateDueDate('this_week')}
            className="cursor-pointer"
          >
            <Calendar className="h-4 w-4 text-dynamic-purple" />
            {t('common.this_week')}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={bulkWorking}
            onClick={() => actions.bulkUpdateDueDate('next_week')}
            className="cursor-pointer"
          >
            <Calendar className="h-4 w-4 text-dynamic-orange" />
            {t('common.next_week')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={bulkWorking}
            onClick={onOpenCustomDate}
            className="cursor-pointer"
          >
            <Calendar className="h-4 w-4" />
            {t('ws-task-boards.bulk.set_custom_due_date')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={bulkWorking}
            onClick={() => actions.bulkUpdateDueDate('clear')}
            className="cursor-pointer text-muted-foreground"
          >
            <X className="h-4 w-4" />
            {t('common.remove_due_date')}
          </DropdownMenuItem>
        </DropdownMenuSubContent>
      </DropdownMenuSub>

      {/* Estimation Menu */}
      {boardConfig?.estimation_type && (
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Timer className="h-4 w-4 text-dynamic-pink" />
            {t('common.estimation')}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-40">
            <div className="max-h-50 overflow-auto">
              <div className="p-1">
                {estimationOptions.map((idx) => {
                  const disabledByExtended =
                    !boardConfig?.extended_estimation && idx > 5;
                  const label = mapEstimationPoints(
                    idx,
                    boardConfig?.estimation_type
                  );

                  return (
                    <DropdownMenuItem
                      key={idx}
                      disabled={bulkWorking || disabledByExtended}
                      onClick={() => actions.bulkUpdateEstimation(idx)}
                      className="flex cursor-pointer items-center justify-between"
                    >
                      <div className="flex items-center gap-2">
                        <Timer className="h-4 w-4 text-dynamic-pink" />
                        <span>
                          {label}
                          {disabledByExtended && (
                            <span className="ml-1 text-[10px] text-muted-foreground/60">
                              ({t('common.upgrade')})
                            </span>
                          )}
                        </span>
                      </div>
                    </DropdownMenuItem>
                  );
                })}
              </div>
            </div>
            <div className="border-t bg-background">
              <DropdownMenuItem
                disabled={bulkWorking}
                onClick={() => actions.bulkUpdateEstimation(null)}
                className="cursor-pointer text-muted-foreground"
              >
                <X className="h-4 w-4" />
                {t('common.none')}
              </DropdownMenuItem>
            </div>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      )}

      {/* Labels Menu */}
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>
          <Tags className="h-4 w-4 text-dynamic-sky" />
          {t('common.labels')}
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="w-80 p-0">
          <div className="border-b p-2">
            <div className="relative">
              <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={t('common.search_labels')}
                value={search.labelQuery}
                onChange={(e) => search.setLabelQuery(e.target.value)}
                className="h-8 border-0 bg-muted/50 pl-9 text-sm focus-visible:ring-0"
              />
            </div>
          </div>

          {filtered.labels.length === 0 ? (
            <div className="px-2 py-6 text-center text-muted-foreground text-xs">
              {search.labelQuery
                ? t('common.no_labels_found')
                : t('common.no_labels_available')}
            </div>
          ) : (
            <div className="max-h-50 overflow-auto">
              <div className="flex flex-col gap-1 p-1">
                {filtered.labels.slice(0, 50).map((label) => {
                  const isApplied = appliedSets.labels.has(label.id);
                  return (
                    <DropdownMenuItem
                      key={label.id}
                      disabled={bulkWorking}
                      onClick={(e) => {
                        e.preventDefault();
                        if (isApplied) {
                          actions.bulkRemoveLabel(label.id);
                        } else {
                          actions.bulkAddLabel(label.id);
                        }
                      }}
                      className={`flex cursor-pointer items-center justify-between gap-2 ${
                        isApplied ? 'bg-dynamic-sky/10 text-dynamic-sky' : ''
                      }`}
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-2">
                        <span
                          className="h-3 w-3 shrink-0 rounded-full"
                          style={{
                            backgroundColor: label.color,
                            opacity: 0.9,
                          }}
                        />
                        <span className="truncate text-sm">{label.name}</span>
                      </div>
                      {isApplied && <Check className="h-4 w-4 shrink-0" />}
                    </DropdownMenuItem>
                  );
                })}
              </div>
            </div>
          )}

          {appliedSets.labels.size > 0 && (
            <div className="relative z-10 border-t bg-background shadow-sm">
              <div className="px-2 pt-1 pb-1 text-[10px] text-muted-foreground">
                {t('ws-task-boards.bulk.applied_to_all', {
                  count: appliedSets.labels.size,
                })}
              </div>
            </div>
          )}

          <div className="border-t">
            <DropdownMenuItem
              onClick={(e) => {
                e.preventDefault();
                toast.info(tc('feature_coming_soon'));
              }}
              className="cursor-pointer text-muted-foreground hover:text-foreground"
            >
              <Plus className="h-4 w-4" />
              {tc('create_new_label')}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={bulkWorking}
              onClick={(e) => {
                e.preventDefault();
                actions.bulkClearLabels();
              }}
              className="cursor-pointer text-dynamic-red hover:text-dynamic-red"
            >
              <X className="h-4 w-4" />
              {t('ws-task-boards.bulk.clear_all_labels')}
            </DropdownMenuItem>
          </div>
        </DropdownMenuSubContent>
      </DropdownMenuSub>

      {/* Projects Menu */}
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>
          <Box className="h-4 w-4 text-dynamic-sky" />
          {tc('projects')}
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="w-80 p-0">
          <div className="border-b p-2">
            <div className="relative">
              <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={tc('search_projects')}
                value={search.projectQuery}
                onChange={(e) => search.setProjectQuery(e.target.value)}
                className="h-8 border-0 bg-muted/50 pl-9 text-sm focus-visible:ring-0"
              />
            </div>
          </div>

          {filtered.projects.length === 0 ? (
            <div className="px-2 py-6 text-center text-muted-foreground text-xs">
              {search.projectQuery
                ? tc('no_projects_found')
                : tc('no_projects_available')}
            </div>
          ) : (
            <div className="max-h-50 overflow-auto">
              <div className="flex flex-col gap-1 p-1">
                {filtered.projects.slice(0, 50).map((project: any) => {
                  const isApplied = appliedSets.projects.has(project.id);
                  return (
                    <DropdownMenuItem
                      key={project.id}
                      disabled={bulkWorking}
                      onClick={(e) => {
                        e.preventDefault();
                        if (isApplied) {
                          actions.bulkRemoveProject(project.id);
                        } else {
                          actions.bulkAddProject(project.id);
                        }
                      }}
                      className={`flex cursor-pointer items-center justify-between gap-2 ${
                        isApplied ? 'bg-dynamic-sky/10 text-dynamic-sky' : ''
                      }`}
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-2">
                        <Box className="h-3 w-3 shrink-0 text-dynamic-sky" />
                        <span className="truncate text-sm">{project.name}</span>
                      </div>
                      {isApplied && <Check className="h-4 w-4 shrink-0" />}
                    </DropdownMenuItem>
                  );
                })}
              </div>
            </div>
          )}

          {appliedSets.projects.size > 0 && (
            <div className="relative z-10 border-t bg-background shadow-sm">
              <div className="px-2 pt-1 pb-1 text-[10px] text-muted-foreground">
                {t('ws-task-boards.bulk.applied_to_all', {
                  count: appliedSets.projects.size,
                })}
              </div>
            </div>
          )}

          <div className="border-t">
            <DropdownMenuItem
              onClick={(e) => {
                e.preventDefault();
                toast.info('Create project feature coming soon');
              }}
              className="cursor-pointer text-muted-foreground hover:text-foreground"
            >
              <Plus className="h-4 w-4" />
              {t('common.create_new_project')}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={bulkWorking}
              onClick={(e) => {
                e.preventDefault();
                actions.bulkClearProjects();
              }}
              className="cursor-pointer text-dynamic-red hover:text-dynamic-red"
            >
              <X className="h-4 w-4" />
              {t('ws-task-boards.bulk.clear_all_projects')}
            </DropdownMenuItem>
          </div>
        </DropdownMenuSubContent>
      </DropdownMenuSub>

      <DropdownMenuSeparator />

      {/* Move Menu */}
      {columns.length > 1 && (
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Move className="h-4 w-4 text-dynamic-blue" />
            {t('common.move_to_list')}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="max-h-100 w-56 overflow-hidden p-0">
            <div className="max-h-50 overflow-auto">
              <div className="p-1">
                {columns.map((list) => {
                  const getStatusIcon = (status: string) => {
                    switch (status) {
                      case 'done':
                        return CheckCircle2;
                      case 'closed':
                        return CircleSlash;
                      case 'not_started':
                        return CircleDashed;
                      case 'active':
                        return CircleFadingArrowUpIcon;
                      default:
                        return List;
                    }
                  };

                  const getStatusColor = (status: string) => {
                    switch (status) {
                      case 'done':
                        return 'text-dynamic-green';
                      case 'closed':
                        return 'text-dynamic-purple';
                      case 'active':
                        return 'text-dynamic-blue';
                      default:
                        return 'opacity-70';
                    }
                  };

                  const StatusIcon = getStatusIcon(list.status);
                  const statusColor = getStatusColor(list.status);

                  return (
                    <DropdownMenuItem
                      key={list.id}
                      disabled={bulkWorking}
                      onClick={(e) => {
                        e.preventDefault();
                        actions.bulkMoveToList(list.id, list.name);
                      }}
                      className="cursor-pointer"
                    >
                      <div className="flex w-full items-center justify-between">
                        <div className="flex items-center gap-3">
                          <StatusIcon className={`h-4 w-4 ${statusColor}`} />
                          {list.name}
                        </div>
                      </div>
                    </DropdownMenuItem>
                  );
                })}
              </div>
            </div>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      )}

      {/* Assignees Menu */}
      {!workspace.personal && (
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <UserStar className="h-4 w-4 text-dynamic-yellow" />
            {t('common.assignees')}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-80 p-0">
            <div className="border-b p-2">
              <div className="relative">
                <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder={tc('search_members')}
                  value={search.assigneeQuery}
                  onChange={(e) => search.setAssigneeQuery(e.target.value)}
                  className="h-8 border-0 bg-muted/50 pl-9 text-sm focus-visible:ring-0"
                />
              </div>
            </div>

            {filtered.members.length === 0 ? (
              <div className="px-2 py-6 text-center text-muted-foreground text-xs">
                {search.assigneeQuery
                  ? tc('no_members_found')
                  : tc('no_members_available')}
              </div>
            ) : (
              <div className="max-h-37.5 overflow-auto">
                <div className="flex flex-col gap-1 p-1">
                  {filtered.members.slice(0, 50).map((member: any) => {
                    const isApplied = appliedSets.assignees.has(member.id);
                    return (
                      <DropdownMenuItem
                        key={member.id}
                        disabled={bulkWorking}
                        onClick={(e) => {
                          e.preventDefault();
                          if (isApplied) {
                            actions.bulkRemoveAssignee(member.id);
                          } else {
                            actions.bulkAddAssignee(member.id);
                          }
                        }}
                        className={`flex cursor-pointer items-center justify-between gap-2 ${
                          isApplied
                            ? 'bg-dynamic-yellow/10 text-dynamic-yellow'
                            : ''
                        }`}
                      >
                        <div className="flex min-w-0 flex-1 items-center gap-2">
                          <Avatar className="h-4 w-4 shrink-0">
                            <AvatarImage src={member.avatar_url} />
                            <AvatarFallback className="bg-muted font-semibold text-[9px]">
                              {member.display_name?.[0] ||
                                member.email?.[0] ||
                                '?'}
                            </AvatarFallback>
                          </Avatar>
                          <span className="truncate text-sm">
                            {member.display_name || member.email}
                          </span>
                        </div>
                        {isApplied && <Check className="h-4 w-4 shrink-0" />}
                      </DropdownMenuItem>
                    );
                  })}
                </div>
              </div>
            )}

            {appliedSets.assignees.size > 0 && (
              <div className="relative z-10 border-t bg-background shadow-sm">
                <div className="px-2 pt-1 pb-1 text-[10px] text-muted-foreground">
                  {t('ws-task-boards.bulk.assigned_to_all', {
                    count: appliedSets.assignees.size,
                  })}
                </div>
              </div>
            )}

            <div className="border-t">
              <DropdownMenuItem
                disabled={bulkWorking}
                onClick={(e) => {
                  e.preventDefault();
                  actions.bulkClearAssignees();
                }}
                className="cursor-pointer text-dynamic-red hover:text-dynamic-red"
              >
                <X className="h-4 w-4" />
                {t('ws-task-boards.bulk.clear_all_assignees')}
              </DropdownMenuItem>
            </div>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      )}

      <DropdownMenuSeparator />

      <DropdownMenuItem
        onClick={onConfirmDelete}
        className="cursor-pointer text-dynamic-red focus:text-dynamic-red"
        disabled={bulkWorking}
      >
        <Trash2 className="h-4 w-4 text-dynamic-red" />
        {t('common.delete_tasks')}
      </DropdownMenuItem>
    </DropdownMenuContent>
  );
}
