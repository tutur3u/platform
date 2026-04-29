'use client';

import { useMutation } from '@tanstack/react-query';
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
import {
  createWorkspaceCourseModule,
  deleteWorkspaceCourseModule,
  reorderWorkspaceCourseModules,
  type UpsertWorkspaceCourseModulePayload,
} from '@tuturuuu/internal-api';
import type {
  WorkspaceCourseBuilderCourse,
  WorkspaceCourseBuilderModule,
} from '@tuturuuu/types/db';
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
import ModifiableDialogTrigger from '@tuturuuu/ui/custom/modifiable-dialog-trigger';
import { useToast } from '@tuturuuu/ui/hooks/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import FlashcardForm from '../../../flashcards/form';
import QuizSetForm from '../../../quiz-sets/form';
import QuizForm from '../../../quizzes/form';
import { ModuleContentEditor } from '../modules/[moduleId]/content/content-editor';

interface CourseBuilderClientProps {
  course: WorkspaceCourseBuilderCourse;
  courseId: string;
  modules: WorkspaceCourseBuilderModule[];
  resolvedWsId: string;
  routeWsId: string;
  backHref?: string;
  backLabel?: string;
  extraHeaderActions?: React.ReactNode;
}

function reorderLocal<T>(list: T[], from: number, to: number) {
  const next = [...list];
  const [moved] = next.splice(from, 1);
  if (!moved) return list;
  next.splice(to, 0, moved);
  return next;
}

function hasRichContent(content: unknown) {
  if (!content || typeof content !== 'object') return false;
  const candidate = content as {
    content?: Array<{ content?: unknown[]; type?: string }>;
  };
  return (candidate.content ?? []).some(
    (node) => node.type !== 'paragraph' || (node.content?.length ?? 0) > 0
  );
}

export function CourseBuilderClient({
  course,
  courseId,
  modules: initialModules,
  resolvedWsId,
  routeWsId,
  backHref,
  backLabel,
  extraHeaderActions,
}: CourseBuilderClientProps) {
  const router = useRouter();
  const { toast } = useToast();
  const t = useTranslations();
  const [modules, setModules] =
    useState<WorkspaceCourseBuilderModule[]>(initialModules);
  const [activeModuleId, setActiveModuleId] = useState<string | null>(
    initialModules[0]?.id ?? null
  );
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const appendCreatedModule = (newModule: {
    content: WorkspaceCourseBuilderModule['content'];
    created_at: WorkspaceCourseBuilderModule['created_at'];
    extra_content: WorkspaceCourseBuilderModule['extra_content'];
    id: WorkspaceCourseBuilderModule['id'];
    is_public: WorkspaceCourseBuilderModule['is_public'];
    is_published: WorkspaceCourseBuilderModule['is_published'];
    name: WorkspaceCourseBuilderModule['name'];
    sort_key: WorkspaceCourseBuilderModule['sort_key'];
    youtube_links: WorkspaceCourseBuilderModule['youtube_links'];
  }) => {
    const builderModule: WorkspaceCourseBuilderModule = {
      ...newModule,
      group_id: courseId,
      flashcard_count: 0,
      quiz_count: 0,
      quiz_set_count: 0,
    };
    setModules((prev) => [...prev, builderModule]);
    setActiveModuleId(newModule.id);
  };

  const activeModule = useMemo(
    () => modules.find((module) => module.id === activeModuleId) ?? null,
    [activeModuleId, modules]
  );

  const reorderMutation = useMutation({
    mutationFn: async (moduleIds: string[]) => {
      await reorderWorkspaceCourseModules(resolvedWsId, courseId, moduleIds);
    },
    onError: (error) => {
      toast({
        title: t('common.error'),
        description: error instanceof Error ? error.message : String(error),
      });
      router.refresh();
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: async (payload: UpsertWorkspaceCourseModulePayload) => {
      return createWorkspaceCourseModule(resolvedWsId, courseId, payload);
    },
    onSuccess: (newModule) => {
      if (newModule) {
        appendCreatedModule(newModule);
      }
      toast({
        title: t('common.success'),
        description: t('ws-course-modules.create_description'),
      });
    },
    onError: (error) => {
      toast({
        title: t('common.error'),
        description: error instanceof Error ? error.message : String(error),
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (moduleId: string) => {
      await deleteWorkspaceCourseModule(resolvedWsId, moduleId);
      return moduleId;
    },
    onSuccess: async (moduleId) => {
      const nextModules = modules.filter((module) => module.id !== moduleId);
      setModules(nextModules);
      setActiveModuleId(nextModules[0]?.id ?? null);
      if (nextModules.length > 0) {
        await reorderMutation.mutateAsync(
          nextModules.map((module) => module.id)
        );
      }
      router.refresh();
    },
    onError: (error) => {
      toast({
        title: t('common.error'),
        description: error instanceof Error ? error.message : String(error),
      });
    },
  });

  const totalModules = modules.length;
  const publishedModules = modules.filter(
    (module) => module.is_published
  ).length;
  const modulesWithContent = modules.filter((module) =>
    hasRichContent(module.content)
  ).length;
  const modulesWithAssessments = modules.filter(
    (module) =>
      module.quiz_count > 0 ||
      module.quiz_set_count > 0 ||
      module.flashcard_count > 0
  ).length;

  const onDropModule = async (targetIndex: number) => {
    if (dragIndex === null || dragIndex === targetIndex) return;
    const next = reorderLocal(modules, dragIndex, targetIndex);
    setModules(next);
    setDragIndex(null);
    await reorderMutation.mutateAsync(next.map((module) => module.id));
  };

  return (
    <div className="space-y-5 p-4">
      <EducationPageHeader
        title={t('workspace-education-tabs.course_builder')}
        description={
          course.description || t('ws-courses.no_description_provided')
        }
        badge={
          <div className="inline-flex items-center gap-2 rounded-full border border-dynamic-blue/20 bg-dynamic-blue/10 px-3 py-1 font-medium text-dynamic-blue text-xs">
            <BookOpenText className="h-3.5 w-3.5" />
            {course.name}
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

      <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)_320px]">
        <EducationContentSurface className="h-fit" padded>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-foreground/70 text-sm uppercase tracking-wide">
                {t('ws-course-modules.plural')}
              </h2>
              <ModifiableDialogTrigger
                title={t('ws-course-modules.singular')}
                createDescription={t('ws-course-modules.create_description')}
                form={
                  <CourseModuleForm
                    wsId={resolvedWsId}
                    courseId={courseId}
                    onCreated={appendCreatedModule}
                  />
                }
                trigger={
                  <Button size="sm" variant="outline" className="rounded-xl">
                    <Plus className="h-4 w-4" />
                    {t('ws-course-modules.create')}
                  </Button>
                }
              />
            </div>

            <div className="space-y-2">
              {modules.map((module, index) => (
                <button
                  key={module.id}
                  type="button"
                  draggable
                  onDragStart={() => setDragIndex(index)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => void onDropModule(index)}
                  onClick={() => setActiveModuleId(module.id)}
                  className={`flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left transition-colors ${
                    module.id === activeModuleId
                      ? 'border-dynamic-blue/30 bg-dynamic-blue/10'
                      : 'border-border/70 bg-background/70 hover:bg-foreground/5'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="line-clamp-1 font-medium text-sm">
                      {module.name}
                    </div>
                    <div className="mt-1 flex items-center gap-1 text-foreground/60 text-xs">
                      <Badge
                        variant="outline"
                        className="h-5 rounded-md px-1.5"
                      >
                        Q {module.quiz_count}
                      </Badge>
                      <Badge
                        variant="outline"
                        className="h-5 rounded-md px-1.5"
                      >
                        S {module.quiz_set_count}
                      </Badge>
                      <Badge
                        variant="outline"
                        className="h-5 rounded-md px-1.5"
                      >
                        F {module.flashcard_count}
                      </Badge>
                    </div>
                  </div>
                  <GripVertical className="h-4 w-4 shrink-0 text-foreground/40" />
                </button>
              ))}
            </div>
          </div>
        </EducationContentSurface>

        <EducationContentSurface className="min-h-[540px]" padded>
          {!activeModule ? (
            <div className="flex min-h-[420px] items-center justify-center rounded-2xl border border-foreground/20 border-dashed bg-foreground/5 text-center text-foreground/65">
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
                <div className="flex items-center justify-between">
                  <span>{t('workspace-education-tabs.assessments_ready')}</span>
                  <Badge
                    variant={
                      totalModules > 0 &&
                      modulesWithAssessments === totalModules
                        ? 'default'
                        : 'secondary'
                    }
                  >
                    {modulesWithAssessments}/{totalModules}
                  </Badge>
                </div>
              </CardContent>
            </Card>

            {activeModule ? (
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
                        duplicateMutation.mutate({
                          content: activeModule.content,
                          extra_content: activeModule.extra_content,
                          is_public: activeModule.is_public,
                          is_published: false,
                          name: `${activeModule.name} (Copy)`,
                          youtube_links: activeModule.youtube_links ?? [],
                        })
                      }
                      disabled={duplicateMutation.isPending}
                    >
                      <Copy className="h-4 w-4" />
                      {t('ws-task-boards.row_actions.duplicate')}
                    </Button>
                    <Button
                      variant="destructive"
                      className="rounded-xl"
                      onClick={() => deleteMutation.mutate(activeModule.id)}
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 className="h-4 w-4" />
                      {t('common.delete')}
                    </Button>
                  </div>
                  <div className="text-foreground/60 text-xs">
                    {t('workspace-education-tabs.drag_reorder_hint')}
                  </div>
                </CardContent>
              </Card>
            ) : null}

            <div className="rounded-xl border border-dynamic-green/20 bg-dynamic-green/10 p-3 text-dynamic-green text-sm">
              {t('workspace-education-tabs.guided_teacher_flow_hint')}
            </div>
          </div>
        </EducationContentSurface>
      </div>
    </div>
  );
}
