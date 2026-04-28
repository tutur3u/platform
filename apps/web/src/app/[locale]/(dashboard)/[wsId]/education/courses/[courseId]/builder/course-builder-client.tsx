'use client';

import {
  BookOpenText,
  Circle,
  ClipboardCheck,
  Copy,
  Ellipsis,
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
import { CourseModuleForm } from '@tuturuuu/ui/custom/education/modules/course-module-form';
import { ModuleToggles } from '@tuturuuu/ui/custom/education/modules/module-toggle';
import { StorageObjectForm } from '@tuturuuu/ui/custom/education/modules/resources/file-upload-form';
import YouTubeLinkForm from '@tuturuuu/ui/custom/education/modules/youtube/form';
import { EducationContentSurface } from '@tuturuuu/ui/custom/education/shell/education-content-surface';
import { EducationKpiStrip } from '@tuturuuu/ui/custom/education/shell/education-kpi-strip';
import { EducationPageHeader } from '@tuturuuu/ui/custom/education/shell/education-page-header';
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
import { toast } from '@tuturuuu/ui/sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { computeAccessibleLabelStyles } from '@tuturuuu/utils/label-colors';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import FlashcardForm from '../../../flashcards/form';
import QuizSetForm from '../../../quiz-sets/form';
import QuizForm from '../../../quizzes/form';
import { ModuleContentEditor } from '../modules/[moduleId]/content/content-editor';
import { ModuleGroupForm } from './module-group-form';
import { useCourseBuilder } from './use-course-builder';

interface CourseBuilderClientProps {
  courseId: string;
  courseName: string;
  resolvedWsId: string;
  routeWsId: string;
}

export function CourseBuilderClient({
  courseId,
  courseName,
  resolvedWsId,
  routeWsId,
}: CourseBuilderClientProps) {
  const t = useTranslations();
  const [dragGroupId, setDragGroupId] = useState<string | null>(null);
  const [dragModuleId, setDragModuleId] = useState<string | null>(null);
  const [dragSourceGroupId, setDragSourceGroupId] = useState<string | null>(
    null
  );
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

  const onDropGroup = async (targetGroupId: string) => {
    if (!dragGroupId || dragGroupId === targetGroupId) return;
    try {
      const ids = moduleGroups.map((group) => group.id);
      const from = ids.indexOf(dragGroupId);
      const to = ids.indexOf(targetGroupId);
      if (from < 0 || to < 0) return;
      const [moved] = ids.splice(from, 1);
      if (!moved) return;
      ids.splice(to, 0, moved);
      await reorderGroupsMutation.mutateAsync(ids);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setDragGroupId(null);
    }
  };

  const onDropModule = async (targetGroupId: string, targetIndex: number) => {
    if (!dragModuleId || !dragSourceGroupId) return;
    try {
      const sourceModules = modulesByGroupId.get(dragSourceGroupId) ?? [];
      const sourceIndex = sourceModules.findIndex(
        (module) => module.id === dragModuleId
      );
      if (sourceIndex < 0) return;

      if (dragSourceGroupId === targetGroupId) {
        const next = [...sourceModules];
        const [moved] = next.splice(sourceIndex, 1);
        if (!moved) return;
        next.splice(targetIndex, 0, moved);
        await reorderModulesMutation.mutateAsync({
          moduleGroupId: targetGroupId,
          moduleIds: next.map((module) => module.id),
        });
      } else {
        const targetModules = modulesByGroupId.get(targetGroupId) ?? [];
        const nextTarget = [...targetModules];
        const movingModule = sourceModules[sourceIndex];
        if (!movingModule) return;
        nextTarget.splice(targetIndex, 0, movingModule);
        await moveModuleMutation.mutateAsync({
          moduleId: dragModuleId,
          targetGroupId,
        });
        await reorderModulesMutation.mutateAsync({
          moduleGroupId: targetGroupId,
          moduleIds: nextTarget.map((module) => module.id),
        });
        const nextSource = sourceModules
          .filter((module) => module.id !== dragModuleId)
          .map((module) => module.id);
        if (nextSource.length > 0) {
          await reorderModulesMutation.mutateAsync({
            moduleGroupId: dragSourceGroupId,
            moduleIds: nextSource,
          });
        }
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setDragModuleId(null);
      setDragSourceGroupId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-5 p-4">
        <EducationPageHeader
          title={t('workspace-education-tabs.course_builder')}
          description={t('ws-courses.no_description_provided')}
          badge={
            <div className="inline-flex items-center gap-2 rounded-full border border-dynamic-blue/20 bg-dynamic-blue/10 px-3 py-1 font-medium text-dynamic-blue text-xs">
              <BookOpenText className="h-3.5 w-3.5" />
              {courseName}
            </div>
          }
          primaryAction={
            <Button
              asChild
              className="h-11 rounded-2xl bg-foreground px-5 text-background"
            >
              <Link href={`/${routeWsId}/education/courses`}>
                {t('workspace-education-tabs.courses')}
              </Link>
            </Button>
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
        description={t('ws-courses.no_description_provided')}
        badge={
          <div className="inline-flex items-center gap-2 rounded-full border border-dynamic-blue/20 bg-dynamic-blue/10 px-3 py-1 font-medium text-dynamic-blue text-xs">
            <BookOpenText className="h-3.5 w-3.5" />
            {courseName}
          </div>
        }
        primaryAction={
          <Button
            asChild
            className="h-11 rounded-2xl bg-foreground px-5 text-background"
          >
            <Link href={`/${routeWsId}/education/courses`}>
              {t('workspace-education-tabs.courses')}
            </Link>
          </Button>
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
              title={t('ws-course-modules.create_group')}
              createDescription={t(
                'ws-course-modules.create_group_description'
              )}
              form={
                <ModuleGroupForm
                  onSubmit={(data) => upsertGroupMutation.mutateAsync({ data })}
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

          <div className="space-y-3">
            {moduleGroups.map((group) => {
              const groupModules = modulesByGroupId.get(group.id) ?? [];
              return (
                <div
                  key={group.id}
                  draggable
                  onDragStart={() => setDragGroupId(group.id)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => void onDropGroup(group.id)}
                  className="rounded-xl border border-border/70 bg-background/70 p-3"
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <GripVertical className="h-4 w-4 shrink-0 text-foreground/40" />
                      {(() => {
                        const GroupIcon =
                          getIconComponentByKey(
                            group.icon as PlatformIconKey | null
                          ) ?? Circle;
                        const colorStyles = computeAccessibleLabelStyles(
                          group.color || '#64748b'
                        );
                        return (
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
                              style={
                                colorStyles
                                  ? { color: colorStyles.text }
                                  : undefined
                              }
                            />
                          </div>
                        );
                      })()}
                      <div className="line-clamp-1 font-medium text-sm">
                        {group.title}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <ModifiableDialogTrigger
                        title={t('ws-course-modules.create')}
                        createDescription={t(
                          'ws-course-modules.create_description'
                        )}
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
                            onCreated={() => {
                              invalidateModuleGroupModules();
                            }}
                          />
                        }
                        trigger={
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 rounded-lg"
                            title={t('ws-course-modules.create')}
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
                            <span className="sr-only">
                              {t('common.actions')}
                            </span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-40">
                          <DropdownMenuItem
                            onClick={() => setEditGroupId(group.id)}
                          >
                            {t('common.edit')}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => setDeleteGroupId(group.id)}
                            className="text-dynamic-red"
                          >
                            {t('common.delete')}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {groupModules.map((module, index) => (
                      <button
                        key={module.id}
                        type="button"
                        draggable
                        onDragStart={() => {
                          setDragModuleId(module.id);
                          setDragSourceGroupId(group.id);
                        }}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={() => void onDropModule(group.id, index)}
                        onClick={() => setActiveModuleId(module.id)}
                        className={`flex w-full items-center justify-between gap-2 rounded-lg border px-2.5 py-2 text-left transition-colors ${
                          module.id === activeModule?.id
                            ? 'border-dynamic-blue/30 bg-dynamic-blue/10'
                            : 'border-border/70 hover:bg-foreground/5'
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="line-clamp-1 font-medium text-sm">
                            {module.name}
                          </div>
                        </div>
                        <GripVertical className="h-4 w-4 shrink-0 text-foreground/40" />
                      </button>
                    ))}
                    <div
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={() =>
                        void onDropModule(group.id, groupModules.length)
                      }
                      className="rounded-lg border border-border border-dashed px-2 py-1.5 text-center text-foreground/50 text-xs"
                    >
                      {t('workspace-education-tabs.drag_reorder_hint')}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

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
                        onSuccess: () => {
                          setDeleteGroupId(null);
                          toast.success(t('ws-course-modules.group_deleted'));
                        },
                        onError: (error) => {
                          toast.error(
                            error instanceof Error
                              ? error.message
                              : String(error)
                          );
                        },
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
                      onClick={() =>
                        duplicateMutation.mutate(
                          {
                            content: activeModule.content,
                            extra_content: activeModule.extra_content,
                            is_public: activeModule.is_public,
                            is_published: false,
                            module_group_id: activeModule.module_group_id,
                            name: `${activeModule.name} (Copy)`,
                            youtube_links: activeModule.youtube_links ?? [],
                          },
                          {
                            onError: (error) => {
                              toast.error(
                                error instanceof Error
                                  ? error.message
                                  : String(error)
                              );
                            },
                          }
                        )
                      }
                    >
                      <Copy className="h-4 w-4" />
                      {t('ws-task-boards.row_actions.duplicate')}
                    </Button>
                    <Button
                      variant="destructive"
                      className="rounded-xl"
                      onClick={() =>
                        deleteModuleMutation.mutate(activeModule.id, {
                          onError: (error) => {
                            toast.error(
                              error instanceof Error
                                ? error.message
                                : String(error)
                            );
                          },
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
