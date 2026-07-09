'use client';

import {
  type CollisionDetection,
  closestCenter,
  DndContext,
  type DragCancelEvent,
  type DragEndEvent,
  type DragOverEvent,
  DragOverlay,
  type DragStartEvent,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { useQueryClient } from '@tanstack/react-query';
import {
  BookOpenText,
  ClipboardCheck,
  Copy,
  GripVertical,
  Link as LinkIcon,
  ListTodo,
  Paperclip,
  Plus,
  SwatchBook,
  Trash2,
} from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { ModuleToggles } from '@tuturuuu/ui/custom/education/modules/module-toggle';
import { StorageObjectForm } from '@tuturuuu/ui/custom/education/modules/resources/file-upload-form';
import YouTubeLinkForm from '@tuturuuu/ui/custom/education/modules/youtube/form';
import { EducationContentSurface } from '@tuturuuu/ui/custom/education/shell/education-content-surface';
import { EducationKpiStrip } from '@tuturuuu/ui/custom/education/shell/education-kpi-strip';
import { EducationPageHeader } from '@tuturuuu/ui/custom/education/shell/education-page-header';
import ModifiableDialogTrigger from '@tuturuuu/ui/custom/modifiable-dialog-trigger';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useState } from 'react';
import FlashcardForm from '../../../flashcards/form';
import QuizSetForm from '../../../quiz-sets/form';
import QuizForm from '../../../quizzes/form';
import { ModuleContentEditor } from '../modules/[moduleId]/content/content-editor';
import { ModuleGroupForm } from './module-group-form';
import { SortableGroup } from './sortable-group';
import { useCourseBuilder } from './use-course-builder';

interface CourseBuilderClientProps {
  courseId: string;
  courseDescription?: string | null;
  courseName: string;
  resolvedWsId: string;
  routeWsId: string;
  backHref?: string;
  backLabel?: string;
  extraHeaderActions?: React.ReactNode;
}

const GROUP_DROPZONE_PREFIX = 'group-dropzone-';

export function CourseBuilderClient({
  courseId,
  courseDescription,
  courseName,
  resolvedWsId,
  routeWsId,
  backHref,
  backLabel,
  extraHeaderActions,
}: CourseBuilderClientProps) {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [moduleDropTargetGroupId, setModuleDropTargetGroupId] = useState<
    string | null
  >(null);
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  const [editGroupId, setEditGroupId] = useState<string | null>(null);
  const [deleteGroupId, setDeleteGroupId] = useState<string | null>(null);

  const {
    activeModule,
    deleteGroupMutation,
    deleteModuleMutation,
    duplicateMutation,
    invalidateModuleGroupModules,
    isLoading,
    moduleGroups,
    modulesByGroupId,
    modulesWithAssessments,
    modulesWithContent,
    moveModuleMutation,
    publishedModules,
    reorderGroupsMutation,
    reorderModulesMutation,
    setActiveModuleId,
    totalModules,
    upsertGroupMutation,
  } = useCourseBuilder({ courseId, resolvedWsId });

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    })
  );

  const modules = useMemo(() => {
    const all: ReturnType<typeof modulesByGroupId.get> = [];
    for (const group of moduleGroups) {
      all.push(...(modulesByGroupId.get(group.id) ?? []));
    }
    return all;
  }, [moduleGroups, modulesByGroupId]);
  const moduleGroupIds = useMemo(
    () => new Set(moduleGroups.map((group) => group.id)),
    [moduleGroups]
  );
  const headerDescription =
    courseDescription?.trim() || t('ws-courses.no_description_provided');

  /** Nested group + module sortables share one DnD tree; the group's droppable wraps the whole card.
   *  Module drags: prefer module hits, then group targets for cross-group moves.
   *  Group drags: prefer pointerWithin on other groups — closestCenter skews toward the dragged card,
   *  which blocks moving a lower group upward until the pointer crosses far enough (asymmetric vs drag-down).
   */
  const collisionDetection = useCallback<CollisionDetection>(
    (args) => {
      const activeId = String(args.active.id);
      const activeIsGroup = moduleGroups.some((g) => g.id === activeId);
      const activeIsModule = modules.some((m) => m.id === activeId);

      if (activeIsGroup) {
        const groupContainers = args.droppableContainers.filter((c) =>
          moduleGroups.some((g) => g.id === String(c.id))
        );
        // Prefer pointer hits on *other* groups. closestCenter alone stays biased toward the
        // dragged card's center, so dragging a lower group upward rarely beats the active group
        // until the pointer has entered the target card (asymmetric vs dragging top downward).
        const otherGroupContainers = groupContainers.filter(
          (c) => String(c.id) !== activeId
        );
        if (otherGroupContainers.length > 0) {
          const pointerOverTarget = pointerWithin({
            ...args,
            droppableContainers: otherGroupContainers,
          });
          if (pointerOverTarget.length > 0) {
            return pointerOverTarget;
          }
        }
        return groupContainers.length > 0
          ? closestCenter({ ...args, droppableContainers: groupContainers })
          : closestCenter(args);
      }

      if (activeIsModule) {
        const moduleContainers = args.droppableContainers.filter((c) =>
          modules.some((m) => m.id === String(c.id))
        );
        const groupTargetContainers = args.droppableContainers.filter((c) => {
          const containerId = String(c.id);
          return (
            moduleGroups.some((g) => g.id === containerId) ||
            containerId.startsWith(GROUP_DROPZONE_PREFIX)
          );
        });

        const pointerOverModules = pointerWithin({
          ...args,
          droppableContainers: moduleContainers,
        });
        if (pointerOverModules.length > 0) {
          return pointerOverModules;
        }

        const pointerOverGroups = pointerWithin({
          ...args,
          droppableContainers: groupTargetContainers,
        });
        if (pointerOverGroups.length > 0) {
          return pointerOverGroups;
        }

        const closestModules = closestCenter({
          ...args,
          droppableContainers: moduleContainers,
        });
        if (closestModules.length > 0) {
          return closestModules;
        }

        return groupTargetContainers.length > 0
          ? closestCenter({
              ...args,
              droppableContainers: groupTargetContainers,
            })
          : closestCenter(args);
      }

      return closestCenter(args);
    },
    [moduleGroups, modules]
  );

  const moduleParentMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const group of moduleGroups) {
      for (const module of modulesByGroupId.get(group.id) ?? []) {
        map.set(module.id, group.id);
      }
    }
    return map;
  }, [moduleGroups, modulesByGroupId]);

  const resolveDropGroupId = useCallback(
    (dropId: string): string | null => {
      const fromModule = moduleParentMap.get(dropId);
      if (fromModule) return fromModule;
      if (moduleGroupIds.has(dropId)) return dropId;
      if (dropId.startsWith(GROUP_DROPZONE_PREFIX)) {
        const groupId = dropId.slice(GROUP_DROPZONE_PREFIX.length);
        if (moduleGroupIds.has(groupId)) return groupId;
      }
      return null;
    },
    [moduleGroupIds, moduleParentMap]
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(String(event.active.id));
    setModuleDropTargetGroupId(null);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const aid = String(event.active.id);
    if (!modules.some((m) => m.id === aid)) {
      setModuleDropTargetGroupId(null);
      return;
    }
    const over = event.over;
    if (!over) {
      setModuleDropTargetGroupId(null);
      return;
    }
    const oid = String(over.id);
    const targetGroupId = resolveDropGroupId(oid);
    if (targetGroupId) {
      setModuleDropTargetGroupId(targetGroupId);
      return;
    }
    setModuleDropTargetGroupId(null);
  };

  const handleDragCancel = (_event: DragCancelEvent) => {
    setActiveId(null);
    setModuleDropTargetGroupId(null);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    setModuleDropTargetGroupId(null);

    if (!over) return;

    const activeIdStr = String(active.id);
    const overIdStr = String(over.id);

    if (activeIdStr === overIdStr) return;

    const isGroup = moduleGroups.some((g) => g.id === activeIdStr);
    const isModule = modules.some((m) => m.id === activeIdStr);

    if (isGroup) {
      const overIsGroup = moduleGroups.some((g) => g.id === overIdStr);
      if (!overIsGroup) return;

      const oldIndex = moduleGroups.findIndex((g) => g.id === activeIdStr);
      const newIndex = moduleGroups.findIndex((g) => g.id === overIdStr);
      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;

      const nextGroups = arrayMove(moduleGroups, oldIndex, newIndex);
      queryClient.setQueryData(
        ['workspaceCourseModuleGroups', resolvedWsId, courseId],
        nextGroups
      );
      reorderGroupsMutation.mutate(
        nextGroups.map((g) => g.id),
        {
          onError: () => {
            queryClient.invalidateQueries({
              queryKey: ['workspaceCourseModuleGroups', resolvedWsId, courseId],
            });
          },
        }
      );
      return;
    }

    if (isModule) {
      const sourceGroupId = moduleParentMap.get(activeIdStr);
      if (!sourceGroupId) return;

      let targetGroupId: string;
      let targetIndex: number;

      const overModuleGroupId = moduleParentMap.get(overIdStr);
      const resolvedDropGroupId = resolveDropGroupId(overIdStr);
      if (overModuleGroupId) {
        targetGroupId = overModuleGroupId;
        const targetModules = modulesByGroupId.get(targetGroupId) ?? [];
        targetIndex = targetModules.findIndex((m) => m.id === overIdStr);
      } else if (resolvedDropGroupId) {
        targetGroupId = resolvedDropGroupId;
        targetIndex = (modulesByGroupId.get(targetGroupId) ?? []).length;
      } else {
        return;
      }

      const sourceModules = modulesByGroupId.get(sourceGroupId) ?? [];
      const activeModuleIndex = sourceModules.findIndex(
        (m) => m.id === activeIdStr
      );
      if (activeModuleIndex === -1) return;
      const movedModule = sourceModules[activeModuleIndex];
      if (!movedModule) return;

      if (sourceGroupId === targetGroupId) {
        const normalizedTargetIndex =
          targetIndex === -1 ? sourceModules.length - 1 : targetIndex;
        if (activeModuleIndex === normalizedTargetIndex) return;
        const nextModules = arrayMove(
          sourceModules,
          activeModuleIndex,
          normalizedTargetIndex
        );
        const groupQueryKey = [
          'workspaceCourseModuleGroupModules',
          resolvedWsId,
          courseId,
          targetGroupId,
        ] as const;
        queryClient.setQueryData(groupQueryKey, nextModules);
        reorderModulesMutation.mutate(
          {
            moduleGroupId: targetGroupId,
            moduleIds: nextModules.map((m) => m.id),
          },
          {
            onError: () => {
              queryClient.setQueryData(groupQueryKey, sourceModules);
            },
            onSettled: () => {
              queryClient.invalidateQueries({ queryKey: groupQueryKey });
            },
          }
        );
      } else {
        const nextSource = sourceModules.filter((m) => m.id !== activeIdStr);
        const targetModules = modulesByGroupId.get(targetGroupId) ?? [];
        const nextTarget = [...targetModules];
        const insertIndex =
          targetIndex >= 0 && targetIndex <= nextTarget.length
            ? targetIndex
            : nextTarget.length;
        nextTarget.splice(insertIndex, 0, {
          ...movedModule,
          module_group_id: targetGroupId,
        });

        const sourceQueryKey = [
          'workspaceCourseModuleGroupModules',
          resolvedWsId,
          courseId,
          sourceGroupId,
        ] as const;
        const targetQueryKey = [
          'workspaceCourseModuleGroupModules',
          resolvedWsId,
          courseId,
          targetGroupId,
        ] as const;

        queryClient.setQueryData(sourceQueryKey, nextSource);
        queryClient.setQueryData(targetQueryKey, nextTarget);

        try {
          await moveModuleMutation.mutateAsync({
            moduleId: activeIdStr,
            sourceGroupId,
            targetGroupId,
          });
        } catch {
          queryClient.setQueryData(sourceQueryKey, sourceModules);
          queryClient.setQueryData(targetQueryKey, targetModules);
          return;
        }
        reorderModulesMutation.mutate(
          {
            moduleGroupId: targetGroupId,
            moduleIds: nextTarget.map((m) => m.id),
          },
          {
            onError: () => {
              queryClient.invalidateQueries({ queryKey: targetQueryKey });
            },
          }
        );
        if (nextSource.length > 0) {
          reorderModulesMutation.mutate(
            {
              moduleGroupId: sourceGroupId,
              moduleIds: nextSource.map((m) => m.id),
            },
            {
              onError: () => {
                queryClient.invalidateQueries({ queryKey: sourceQueryKey });
              },
            }
          );
        }
      }
    }
  };

  const activeGroup = activeId
    ? moduleGroups.find((g) => g.id === activeId)
    : null;
  const activeModuleItem = activeId
    ? modules.find((m) => m.id === activeId)
    : null;

  const draggingModuleSourceGroupId =
    activeId && modules.some((m) => m.id === activeId)
      ? (moduleParentMap.get(activeId) ?? null)
      : null;

  if (isLoading) {
    return (
      <div className="space-y-5 p-4">
        <EducationPageHeader
          title={t('workspace-education-tabs.course_builder')}
          description={headerDescription}
          badge={
            <div className="inline-flex items-center gap-2 rounded-full border border-dynamic-blue/20 bg-dynamic-blue/10 px-3 py-1 font-medium text-dynamic-blue text-xs">
              <BookOpenText className="h-3.5 w-3.5" />
              {courseName}
            </div>
          }
          primaryAction={
            <div className="flex items-center gap-2">
              {extraHeaderActions}
              <Button
                asChild
                className="h-11 rounded-2xl bg-foreground px-5 text-background"
              >
                <Link href={backHref ?? `/${routeWsId}/education/courses`}>
                  {backLabel ?? t('workspace-education-tabs.courses')}
                </Link>
              </Button>
            </div>
          }
        />

        <EducationContentSurface className="min-h-120" padded>
          <div className="flex min-h-105 items-center justify-center rounded-2xl border border-border/70 border-dashed bg-foreground/5 text-foreground/65">
            <div className="flex flex-col items-center gap-3 text-center">
              <div className="h-10 w-10 animate-spin rounded-full border-2 border-dynamic-blue border-t-transparent" />
              <div className="font-medium text-sm">{t('common.loading')}</div>
            </div>
          </div>
        </EducationContentSurface>
      </div>
    );
  }

  return (
    <div className="space-y-5 p-4">
      <EducationPageHeader
        title={t('workspace-education-tabs.course_builder')}
        description={headerDescription}
        badge={
          <div className="inline-flex items-center gap-2 rounded-full border border-dynamic-blue/20 bg-dynamic-blue/10 px-3 py-1 font-medium text-dynamic-blue text-xs">
            <BookOpenText className="h-3.5 w-3.5" />
            {courseName}
          </div>
        }
        primaryAction={
          <div className="flex items-center gap-2">
            {extraHeaderActions}
            <Button
              asChild
              className="h-11 rounded-2xl bg-foreground px-5 text-background"
            >
              <Link href={backHref ?? `/${routeWsId}/education/courses`}>
                {backLabel ?? t('workspace-education-tabs.courses')}
              </Link>
            </Button>
          </div>
        }
      />

      <EducationKpiStrip
        items={[
          {
            label: t('ws-course-modules.plural'),
            tone: 'blue',
            value: totalModules,
          },
          {
            label: t('common.published'),
            tone: 'green',
            value: `${publishedModules}/${totalModules}`,
          },
          {
            label: t('course-details-tabs.module_content'),
            tone: 'sky',
            value: `${modulesWithContent}/${totalModules}`,
          },
          {
            label: t('workspace-education-tabs.assessments_ready'),
            tone: 'purple',
            value: `${modulesWithAssessments}/${totalModules}`,
          },
        ]}
      />

      <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)_320px]">
        <EducationContentSurface className="h-fit" padded>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold text-foreground/70 text-sm uppercase tracking-wide">
              {t('ws-course-modules.module_groups')}
            </h2>
            <ModifiableDialogTrigger
              open={isCreateGroupOpen}
              setOpen={setIsCreateGroupOpen}
              title={t('ws-course-modules.create_group')}
              createDescription={t(
                'ws-course-modules.create_group_description'
              )}
              form={
                <ModuleGroupForm
                  onSubmit={(data) => upsertGroupMutation.mutateAsync({ data })}
                  onFinish={() => setIsCreateGroupOpen(false)}
                />
              }
              trigger={
                <Button size="sm" variant="outline" className="rounded-xl">
                  <Plus className="h-4 w-4" />
                  {t('ws-course-modules.create_group')}
                </Button>
              }
            />
          </div>

          <DndContext
            sensors={sensors}
            collisionDetection={collisionDetection}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragCancel={handleDragCancel}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={moduleGroups.map((g) => g.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-3">
                {moduleGroups.map((group) => (
                  <SortableGroup
                    key={group.id}
                    group={group}
                    modules={modulesByGroupId.get(group.id) ?? []}
                    activeModuleId={activeModule?.id ?? null}
                    resolvedWsId={resolvedWsId}
                    courseId={courseId}
                    moduleGroups={moduleGroups}
                    onSetActiveModuleId={setActiveModuleId}
                    onEditGroup={setEditGroupId}
                    onDeleteGroup={setDeleteGroupId}
                    onInvalidate={invalidateModuleGroupModules}
                    isModuleDragDropTarget={
                      draggingModuleSourceGroupId !== null &&
                      moduleDropTargetGroupId === group.id
                    }
                    showCrossGroupModuleDropHint={
                      draggingModuleSourceGroupId !== null &&
                      moduleDropTargetGroupId === group.id &&
                      draggingModuleSourceGroupId !== group.id
                    }
                  />
                ))}
              </div>
            </SortableContext>

            <DragOverlay dropAnimation={null}>
              {activeGroup ? (
                <div className="rounded-xl border border-border/70 bg-background/95 p-3 opacity-90 shadow-xl">
                  <div className="flex items-center gap-2">
                    <GripVertical className="h-4 w-4 text-foreground/40" />
                    <span className="font-medium text-sm">
                      {activeGroup.title}
                    </span>
                  </div>
                </div>
              ) : activeModuleItem ? (
                <div className="pointer-events-none flex min-h-11 min-w-[220px] max-w-[min(100vw-2rem,320px)] flex-col gap-1 rounded-xl border-2 border-dynamic-blue/45 bg-background/98 px-3 py-2.5 text-left shadow-2xl ring-2 ring-dynamic-blue/25 ring-offset-2 ring-offset-background">
                  <div className="font-medium text-foreground text-xs uppercase tracking-wide">
                    {t('ws-course-modules.singular')}
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="line-clamp-2 font-medium text-sm leading-snug">
                      {activeModuleItem.name}
                    </div>
                    <GripVertical className="h-4 w-4 shrink-0 text-foreground/45" />
                  </div>
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>

          <ModifiableDialogTrigger
            open={!!editGroupId}
            setOpen={(open) => !open && setEditGroupId(null)}
            title={moduleGroups.find((g) => g.id === editGroupId)?.title ?? ''}
            editDescription={t('ws-course-modules.edit_description')}
            data={moduleGroups.find((g) => g.id === editGroupId)}
            form={
              <ModuleGroupForm
                onSubmit={(payload) =>
                  upsertGroupMutation.mutateAsync({
                    id: editGroupId!,
                    data: payload,
                  })
                }
                onFinish={() => setEditGroupId(null)}
              />
            }
          />

          <ModifiableDialogTrigger
            open={!!deleteGroupId}
            setOpen={(open) => !open && setDeleteGroupId(null)}
            title={t('ws-courses.delete_confirm_title', {
              name:
                moduleGroups.find((g) => g.id === deleteGroupId)?.title ?? '',
            })}
            editDescription={t('common.confirm_delete_description')}
            form={
              <div className="flex justify-end gap-2 pt-4">
                <Button
                  variant="outline"
                  onClick={() => setDeleteGroupId(null)}
                >
                  {t('common.cancel')}
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => {
                    if (deleteGroupId) {
                      deleteGroupMutation.mutate(deleteGroupId, {
                        onSuccess: () => setDeleteGroupId(null),
                      });
                    }
                  }}
                  disabled={deleteGroupMutation.isPending}
                >
                  {t('common.delete')}
                </Button>
              </div>
            }
          />
        </EducationContentSurface>

        <EducationContentSurface className="min-h-135" padded>
          {!activeModule ? (
            <div className="flex min-h-105 items-center justify-center rounded-2xl border border-foreground/20 border-dashed bg-foreground/5 text-center text-foreground/65">
              {t('common.no_content_yet')}
            </div>
          ) : (
            <Tabs defaultValue="content" className="space-y-4">
              <TabsList className="grid h-auto w-full grid-cols-3 gap-1 rounded-xl bg-muted/60 p-1 md:grid-cols-7">
                <TabsTrigger value="content">
                  {t('course-details-tabs.module_content')}
                </TabsTrigger>
                <TabsTrigger value="resources">
                  {t('course-details-tabs.resources')}
                </TabsTrigger>
                <TabsTrigger value="youtube">
                  {t('course-details-tabs.youtube_links')}
                </TabsTrigger>
                <TabsTrigger value="quiz-sets">
                  {t('ws-quiz-sets.plural')}
                </TabsTrigger>
                <TabsTrigger value="quizzes">
                  {t('ws-quizzes.plural')}
                </TabsTrigger>
                <TabsTrigger value="flashcards">
                  {t('ws-flashcards.plural')}
                </TabsTrigger>
                <TabsTrigger value="extra">
                  {t('course-details-tabs.extra_reading')}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="content" className="space-y-3">
                <ModuleContentEditor
                  wsId={resolvedWsId}
                  courseId={courseId}
                  moduleId={activeModule.id}
                  content={(activeModule.content as never) ?? undefined}
                />
              </TabsContent>

              <TabsContent value="resources" className="space-y-3">
                <StorageObjectForm
                  wsId={resolvedWsId}
                  submitLabel={t('common.upload')}
                  path={`${resolvedWsId}/courses/${courseId}/modules/${activeModule.id}/resources/`}
                />
                <Button asChild variant="outline" className="rounded-xl">
                  <Link
                    href={`/${routeWsId}/education/courses/${courseId}/modules/${activeModule.id}/resources`}
                  >
                    <Paperclip className="h-4 w-4" />
                    {t('common.view')}
                  </Link>
                </Button>
              </TabsContent>

              <TabsContent value="youtube" className="space-y-3">
                <YouTubeLinkForm
                  wsId={resolvedWsId}
                  moduleId={activeModule.id}
                  links={activeModule.youtube_links || []}
                />
              </TabsContent>

              <TabsContent value="quiz-sets" className="space-y-3">
                <QuizSetForm wsId={resolvedWsId} moduleId={activeModule.id} />
                <Button asChild variant="outline" className="rounded-xl">
                  <Link
                    href={`/${routeWsId}/education/courses/${courseId}/modules/${activeModule.id}/quiz-sets`}
                  >
                    <ListTodo className="h-4 w-4" />
                    {t('common.view')}
                  </Link>
                </Button>
              </TabsContent>

              <TabsContent value="quizzes" className="space-y-3">
                <QuizForm wsId={resolvedWsId} moduleId={activeModule.id} />
                <Button asChild variant="outline" className="rounded-xl">
                  <Link
                    href={`/${routeWsId}/education/courses/${courseId}/modules/${activeModule.id}/quizzes`}
                  >
                    <ClipboardCheck className="h-4 w-4" />
                    {t('common.view')}
                  </Link>
                </Button>
              </TabsContent>

              <TabsContent value="flashcards" className="space-y-3">
                <FlashcardForm wsId={resolvedWsId} moduleId={activeModule.id} />
                <Button asChild variant="outline" className="rounded-xl">
                  <Link
                    href={`/${routeWsId}/education/courses/${courseId}/modules/${activeModule.id}/flashcards`}
                  >
                    <SwatchBook className="h-4 w-4" />
                    {t('common.view')}
                  </Link>
                </Button>
              </TabsContent>

              <TabsContent value="extra" className="space-y-3">
                <Button asChild variant="outline" className="rounded-xl">
                  <Link
                    href={`/${routeWsId}/education/courses/${courseId}/modules/${activeModule.id}/extra-content`}
                  >
                    <LinkIcon className="h-4 w-4" />
                    {t('common.open')}
                  </Link>
                </Button>
              </TabsContent>
            </Tabs>
          )}
        </EducationContentSurface>

        <EducationContentSurface className="h-fit" padded>
          <div className="space-y-4">
            <h2 className="font-semibold text-foreground/70 text-sm uppercase tracking-wide">
              {t('workspace-education-tabs.publish_checklist')}
            </h2>
            <Card className="border-border/60">
              <CardHeader>
                <CardTitle className="text-base">
                  {t('common.status')}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span>{t('ws-course-modules.plural')}</span>
                  <Badge variant={totalModules > 0 ? 'default' : 'secondary'}>
                    {totalModules > 0
                      ? t('calendar-sidebar.ready')
                      : t('common.pending')}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span>{t('course-details-tabs.module_content')}</span>
                  <Badge
                    variant={
                      totalModules > 0 && modulesWithContent === totalModules
                        ? 'default'
                        : 'secondary'
                    }
                  >
                    {modulesWithContent}/{totalModules}
                  </Badge>
                </div>
              </CardContent>
            </Card>

            {activeModule && (
              <Card className="border-border/60">
                <CardHeader>
                  <CardTitle className="text-base">
                    {activeModule.name}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <ModuleToggles
                    wsId={resolvedWsId}
                    courseId={courseId}
                    moduleId={activeModule.id}
                    isPublished={activeModule.is_published}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      variant="outline"
                      className="rounded-xl"
                      disabled={duplicateMutation.isPending}
                      onClick={() =>
                        duplicateMutation.mutate({
                          content: activeModule.content,
                          extra_content: activeModule.extra_content,
                          is_public: activeModule.is_public,
                          is_published: false,
                          module_group_id: activeModule.module_group_id,
                          name: `${activeModule.name} (Copy)`,
                          youtube_links: activeModule.youtube_links ?? [],
                        })
                      }
                    >
                      <Copy className="h-4 w-4" />
                      {t('ws-task-boards.row_actions.duplicate')}
                    </Button>
                    <Button
                      variant="destructive"
                      className="rounded-xl"
                      disabled={deleteModuleMutation.isPending}
                      onClick={() =>
                        deleteModuleMutation.mutate({
                          moduleGroupId: activeModule.module_group_id,
                          moduleId: activeModule.id,
                        })
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                      {t('common.delete')}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </EducationContentSurface>
      </div>
    </div>
  );
}
