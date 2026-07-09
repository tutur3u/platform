'use client';

import { useDroppable } from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Circle, Ellipsis, GripVertical, Plus } from '@tuturuuu/icons';
import type {
  WorkspaceCourseBuilderModule,
  WorkspaceCourseModuleGroup,
} from '@tuturuuu/types/db';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { CourseModuleForm } from '@tuturuuu/ui/custom/education/modules/course-module-form';
import {
  getIconComponentByKey,
  type PlatformIconKey,
} from '@tuturuuu/ui/custom/icon-picker';
import ModifiableDialogTrigger from '@tuturuuu/ui/custom/modifiable-dialog-trigger';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { cn } from '@tuturuuu/utils/format';
import { computeAccessibleLabelStyles } from '@tuturuuu/utils/label-colors';
import { useTranslations } from 'next-intl';
import { SortableModule } from './sortable-module';

interface SortableGroupProps {
  group: WorkspaceCourseModuleGroup;
  modules: WorkspaceCourseBuilderModule[];
  activeModuleId: string | null;
  resolvedWsId: string;
  courseId: string;
  moduleGroups: WorkspaceCourseModuleGroup[];
  isModuleDragDropTarget?: boolean;
  showCrossGroupModuleDropHint?: boolean;
  onSetActiveModuleId: (id: string) => void;
  onEditGroup: (id: string) => void;
  onDeleteGroup: (id: string) => void;
  onInvalidate: () => void;
}

export function SortableGroup({
  group,
  modules,
  activeModuleId,
  resolvedWsId,
  courseId,
  moduleGroups,
  isModuleDragDropTarget = false,
  showCrossGroupModuleDropHint = false,
  onSetActiveModuleId,
  onEditGroup,
  onDeleteGroup,
  onInvalidate,
}: SortableGroupProps) {
  const t = useTranslations('ws-course-modules');
  const te = useTranslations('workspace-education-tabs');
  const tc = useTranslations('common');
  const moduleDropzoneId = `group-dropzone-${group.id}`;

  const {
    setNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: group.id,
    data: { type: 'group', group },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const { setNodeRef: setModuleDropzoneRef, isOver: isModuleDropzoneOver } =
    useDroppable({
      id: moduleDropzoneId,
      data: { type: 'module-dropzone', groupId: group.id },
    });

  const GroupIcon =
    getIconComponentByKey(group.icon as PlatformIconKey | null) ?? Circle;
  const colorStyles = computeAccessibleLabelStyles(group.color || '#64748b');

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'rounded-xl border border-border/70 bg-background/70 p-3 transition-[box-shadow,background-color,border-color] duration-150',
        isDragging && 'z-10 opacity-80 shadow-lg',
        isModuleDragDropTarget &&
          'border-dynamic-blue/50 bg-dynamic-blue/[0.07] shadow-md ring-2 ring-dynamic-blue/35 ring-offset-2 ring-offset-background'
      )}
      aria-live={showCrossGroupModuleDropHint ? 'polite' : undefined}
    >
      {showCrossGroupModuleDropHint ? (
        <div className="mb-2 rounded-lg border border-dynamic-blue/40 bg-dynamic-blue/15 px-2.5 py-2 text-center font-medium text-dynamic-blue text-xs leading-snug">
          {te('module_drop_target_hint')}
        </div>
      ) : null}

      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            {...attributes}
            {...listeners}
            aria-label={group.title}
            className="shrink-0 cursor-grab text-foreground/40 hover:text-foreground/70 active:cursor-grabbing"
          >
            <GripVertical className="h-4 w-4" />
          </button>
          <div
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md"
            style={
              colorStyles
                ? {
                    backgroundColor: colorStyles.bg,
                    borderColor: colorStyles.border,
                    borderWidth: '1px',
                  }
                : undefined
            }
          >
            <GroupIcon
              className="h-3.5 w-3.5"
              style={colorStyles ? { color: colorStyles.text } : undefined}
            />
          </div>
          <div className="line-clamp-1 font-medium text-sm">{group.title}</div>
          <Badge variant="secondary" className="shrink-0 text-xs">
            {modules.length}
          </Badge>
        </div>
        <div className="flex items-center gap-1">
          <ModifiableDialogTrigger
            title={t('create')}
            createDescription={t('create_description')}
            form={
              <CourseModuleForm
                wsId={resolvedWsId}
                courseId={courseId}
                defaultModuleGroupId={group.id}
                moduleGroups={moduleGroups.map((g) => ({
                  id: g.id,
                  title: g.title,
                  icon: g.icon,
                  color: g.color,
                }))}
                onCreated={() => onInvalidate()}
              />
            }
            trigger={
              <Button
                variant="ghost"
                size="icon"
                aria-label={t('create')}
                className="h-7 w-7 rounded-lg"
                title={t('create')}
              >
                <Plus className="h-4 w-4" />
              </Button>
            }
          />
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 rounded-lg"
              >
                <Ellipsis className="h-4 w-4" />
                <span className="sr-only">{tc('actions')}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem onClick={() => onEditGroup(group.id)}>
                {tc('edit')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => onDeleteGroup(group.id)}
                className="text-dynamic-red"
              >
                {tc('delete')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <SortableContext
        items={modules.map((m) => m.id)}
        strategy={verticalListSortingStrategy}
      >
        <div
          ref={setModuleDropzoneRef}
          className={cn(
            'min-h-10 space-y-2 rounded-lg transition-colors',
            isModuleDropzoneOver && 'bg-dynamic-blue/10'
          )}
        >
          {modules.map((module) => (
            <SortableModule
              key={module.id}
              module={module}
              isActive={module.id === activeModuleId}
              onClick={() => onSetActiveModuleId(module.id)}
            />
          ))}
          {modules.length === 0 && (
            <div className="rounded-lg border border-border border-dashed px-2 py-1.5 text-center text-foreground/50 text-xs">
              {te('drag_reorder_hint')}
            </div>
          )}
        </div>
      </SortableContext>
    </div>
  );
}
