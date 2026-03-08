'use client';

import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import {
  BarChart3,
  Check,
  ChevronDown,
  Eye,
  LayoutTemplate,
  Link,
  Settings2,
  Table2,
} from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent } from '@tuturuuu/ui/card';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@tuturuuu/ui/collapsible';
import { useFieldArray, useForm, useWatch } from '@tuturuuu/ui/hooks/use-form';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { zodResolver } from '@tuturuuu/ui/resolvers';
import { toast } from '@tuturuuu/ui/sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { Textarea } from '@tuturuuu/ui/textarea';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { parseAsString, useQueryState } from 'nuqs';
import { useEffect, useMemo, useRef, useState } from 'react';

import { FORM_FONT_VARIABLES, getFormFontStyle } from '../fonts';
import { FormRuntime } from '../form-runtime';
import {
  useFormAnalyticsQuery,
  useFormResponsesQuery,
  useFormShareLink,
  useSaveFormMutation,
} from '../hooks';
import { type FormStudioInput, formStudioSchema } from '../schema';
import { getFormToneClasses } from '../theme';
import type {
  FormAnalytics,
  FormDefinition,
  FormResponseRecord,
  FormResponseSummary,
  FormResponsesQuestionAnalytics,
} from '../types';
import { AnalyticsPanel } from './analytics-panel';
import { BuilderSidebar } from './builder-sidebar';
import { FontPreviewPanel } from './font-preview-panel';
import { FormMediaField } from './form-media-field';
import { LogicRulesEditor } from './logic-rules-editor';
import { ResponsesPanel } from './responses-panel';
import { SectionEditor } from './section-editor';
import { SettingsPanel } from './settings-panel';
import {
  createClientId,
  ensureIdentifiers,
  toPreviewDefinition,
  toStudioInput,
} from './studio-utils';
import { ThemePickerPanel } from './theme-picker-panel';

const STUDIO_PAGE_GRADIENT_VARS: Record<
  FormStudioInput['theme']['accentColor'],
  [string, string]
> = {
  'dynamic-blue': ['--dynamic-blue', '--dynamic-cyan'],
  'dynamic-cyan': ['--dynamic-cyan', '--dynamic-blue'],
  'dynamic-gray': ['--dynamic-gray', '--dynamic-gray'],
  'dynamic-green': ['--dynamic-green', '--dynamic-yellow'],
  'dynamic-indigo': ['--dynamic-indigo', '--dynamic-purple'],
  'dynamic-orange': ['--dynamic-orange', '--dynamic-yellow'],
  'dynamic-pink': ['--dynamic-pink', '--dynamic-red'],
  'dynamic-purple': ['--dynamic-purple', '--dynamic-pink'],
  'dynamic-red': ['--dynamic-red', '--dynamic-orange'],
  'dynamic-yellow': ['--dynamic-yellow', '--dynamic-orange'],
};

function isErrorRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function findFirstValidationError(
  value: unknown,
  path: string[] = []
): { path: string[]; message?: string } | null {
  if (!isErrorRecord(value)) {
    return null;
  }

  if (typeof value.message === 'string' && value.message.trim()) {
    return { path, message: value.message };
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    if (key === 'ref' || key === 'types') {
      continue;
    }

    const nestedError = findFirstValidationError(nestedValue, [...path, key]);
    if (nestedError) {
      return nestedError;
    }
  }

  return null;
}

export function FormStudio({
  wsId,
  workspaceSlug,
  mode,
  initialForm,
  initialResponses,
  initialResponsesTotal,
  initialResponsesSummary,
  initialQuestionAnalytics,
  initialAnalytics,
}: {
  wsId: string;
  workspaceSlug: string;
  mode: 'create' | 'edit';
  initialForm?: FormDefinition;
  initialResponses?: FormResponseRecord[];
  initialResponsesTotal?: number;
  initialResponsesSummary?: FormResponseSummary;
  initialQuestionAnalytics?: FormResponsesQuestionAnalytics[];
  initialAnalytics?: FormAnalytics;
}) {
  const t = useTranslations('forms');
  const tCommon = useTranslations('common');
  const pathname = usePathname();
  const router = useRouter();
  const saveMutation = useSaveFormMutation({
    wsId,
    formId: initialForm?.id,
  });
  const [activeTab, setActiveTab] = useQueryState(
    'tab',
    parseAsString.withDefault('build').withOptions({ shallow: true })
  );
  const [hasCopied, setHasCopied] = useState(false);
  const [activeSectionId, setActiveSectionId] = useState('');
  const [isFormDetailsOpen, setIsFormDetailsOpen] = useState(false);
  const [showFloatingSave, setShowFloatingSave] = useState(false);
  const primarySaveButtonRef = useRef<HTMLButtonElement | null>(null);

  const form = useForm<FormStudioInput, any, FormStudioInput>({
    resolver: zodResolver(formStudioSchema) as any,
    defaultValues: toStudioInput(initialForm),
  });

  const values = useWatch({ control: form.control }) as FormStudioInput;
  const isDirty = form.formState.isDirty;
  const questionCount = values.sections.reduce(
    (total, section) => total + section.questions.length,
    0
  );
  const previewDefinition = useMemo(
    () =>
      toPreviewDefinition(values, {
        id: initialForm?.id ?? createClientId(),
        wsId,
        creatorId: initialForm?.creatorId ?? createClientId(),
      }),
    [values, initialForm?.id, initialForm?.creatorId, wsId]
  );

  const sectionsArray = useFieldArray({
    control: form.control,
    name: 'sections',
  });
  const sectionSensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );
  const studioToneClasses = getFormToneClasses(values.theme.accentColor);
  const studioBodyFontStyle = getFormFontStyle(values.theme.bodyFontId);
  const studioHeadlineFontStyle = getFormFontStyle(values.theme.headlineFontId);
  const [studioPrimaryColorVar, studioSecondaryColorVar] =
    STUDIO_PAGE_GRADIENT_VARS[values.theme.accentColor];
  const studioLoopGradient = `linear-gradient(180deg,
    hsl(var(--background)) 0%,
    rgb(var(${studioPrimaryColorVar}) / 0.04) 18%,
    rgb(var(${studioPrimaryColorVar}) / 0.08) 34%,
    rgb(var(${studioSecondaryColorVar}) / 0.11) 50%,
    rgb(var(${studioSecondaryColorVar}) / 0.11) 56%,
    rgb(var(${studioPrimaryColorVar}) / 0.08) 72%,
    rgb(var(${studioPrimaryColorVar}) / 0.04) 86%,
    hsl(var(--background)) 100%)`;

  const { data: shareQuery } = useFormShareLink({
    wsId,
    formId: initialForm?.id ?? '',
    enabled: mode === 'edit' && !!initialForm?.id,
  });
  const responsesQuery = useFormResponsesQuery({
    wsId,
    formId: initialForm?.id ?? '',
    enabled: mode === 'edit' && !!initialForm?.id,
    initialData: {
      total: initialResponsesTotal ?? 0,
      records: initialResponses ?? [],
      summary: initialResponsesSummary ?? {
        anonymousSubmissions: 0,
        authenticatedResponders: 0,
        duplicateAuthenticatedResponders: 0,
        duplicateAuthenticatedSubmissions: 0,
        hasMultipleSubmissionsByUser: false,
        totalResponders: 0,
        totalSubmissions: 0,
      },
      questionAnalytics: initialQuestionAnalytics ?? [],
    },
  });
  const analyticsQuery = useFormAnalyticsQuery({
    wsId,
    formId: initialForm?.id ?? '',
    enabled: mode === 'edit' && !!initialForm?.id,
    initialData: initialAnalytics ?? {
      activity: [],
      avgCompletionSeconds: 0,
      browsers: [],
      cities: [],
      completionFromStartsRate: 0,
      completionRate: 0,
      countries: [],
      devices: [],
      dropoffByQuestion: [],
      dropoffBySection: [],
      operatingSystems: [],
      responderModeBreakdown: [],
      startRate: 0,
      topReferrers: [],
      totalAbandons: 0,
      totalStarts: 0,
      totalSubmissions: 0,
      totalViews: 0,
      uniqueCountries: 0,
      uniqueReferrers: 0,
    },
  });
  const responseSummary = responsesQuery.data?.summary ?? {
    anonymousSubmissions: 0,
    authenticatedResponders: 0,
    duplicateAuthenticatedResponders: 0,
    duplicateAuthenticatedSubmissions: 0,
    hasMultipleSubmissionsByUser: false,
    totalResponders: 0,
    totalSubmissions: 0,
  };
  const resolvedActiveSectionId =
    values.sections.find((section) => section.id === activeSectionId)?.id ?? '';

  const handleCopyLink = () => {
    if (!shareQuery?.shareLink?.code) return;
    const url = `${window.location.origin}/shared/forms/${shareQuery.shareLink.code}`;
    navigator.clipboard.writeText(url);
    setHasCopied(true);
    setTimeout(() => setHasCopied(false), 2000);
  };

  const addSection = () => {
    const sectionId = createClientId();
    sectionsArray.append({
      id: sectionId,
      title: t('studio.section_number', {
        count: sectionsArray.fields.length + 1,
      }),
      description: '',
      image: {
        storagePath: '',
        url: '',
        alt: '',
      },
      questions: [
        {
          id: createClientId(),
          type: 'short_text',
          title: t('studio.new_question'),
          description: '',
          required: false,
          settings: {
            placeholder: t('runtime.type_your_answer'),
          },
          options: [],
        },
      ],
    });
    setActiveSectionId(sectionId);
  };

  const handleTabChange = (nextTab: string) => {
    void setActiveTab(nextTab);

    if (nextTab === 'responses' && mode === 'edit') {
      void responsesQuery.refetch();
    }

    if (nextTab === 'analytics' && mode === 'edit') {
      void analyticsQuery.refetch();
    }
  };

  const getSaveValidationMessage = (
    error: ReturnType<typeof findFirstValidationError>
  ) => {
    if (!error) {
      return t('toast.fix_validation_errors');
    }

    const [root, sectionIndexRaw, child, questionIndexRaw, nestedChild] =
      error.path;
    const section = Number(sectionIndexRaw) + 1;
    const question = Number(questionIndexRaw) + 1;

    if (root === 'title') {
      return t('toast.form_title_required');
    }

    if (
      root === 'sections' &&
      child === 'questions' &&
      nestedChild === 'title' &&
      Number.isFinite(section) &&
      Number.isFinite(question)
    ) {
      return t('toast.question_title_required', {
        section,
        question,
      });
    }

    if (
      root === 'sections' &&
      child === 'questions' &&
      nestedChild === 'options' &&
      Number.isFinite(section) &&
      Number.isFinite(question)
    ) {
      return t('toast.option_label_required', {
        section,
        question,
      });
    }

    if (root === 'logicRules' && error.path.includes('comparisonValue')) {
      return t('toast.logic_rule_value_required');
    }

    if (root === 'logicRules' && error.path.includes('sourceQuestionId')) {
      return t('toast.logic_rule_question_required');
    }

    if (root === 'logicRules' && error.path.includes('targetSectionId')) {
      return t('toast.logic_rule_target_required');
    }

    if (root === 'sections' && child === 'questions') {
      return t('toast.section_needs_question', {
        section,
      });
    }

    return error.message ?? t('toast.fix_validation_errors');
  };

  const handleSave = form.handleSubmit(
    async (payload) => {
      const normalizedPayload = ensureIdentifiers(payload);
      let result: { id: string } | null = null;

      try {
        result = await saveMutation.mutateAsync(normalizedPayload);
      } catch {
        return;
      }

      if (mode === 'create') {
        const nextPath = pathname.endsWith('/new')
          ? `${pathname.slice(0, -4)}/${result.id}`
          : `/${workspaceSlug}/forms/${result.id}`;
        router.push(nextPath);
        return;
      }

      form.reset(normalizedPayload);
      router.refresh();
    },
    (errors) => {
      const firstError = findFirstValidationError(errors);
      toast.error(getSaveValidationMessage(firstError));
    }
  );

  const handleSectionDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) {
      return;
    }

    const oldIndex = sectionsArray.fields.findIndex(
      (field) => field.id === active.id
    );
    const newIndex = sectionsArray.fields.findIndex(
      (field) => field.id === over.id
    );

    if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) {
      return;
    }

    sectionsArray.move(oldIndex, newIndex);
  };

  useEffect(() => {
    const saveButton = primarySaveButtonRef.current;
    if (!saveButton) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        setShowFloatingSave(!entry?.isIntersecting);
      },
      {
        threshold: 0.9,
      }
    );

    observer.observe(saveButton);

    return () => observer.disconnect();
  }, []);

  return (
    <div
      className={cn(
        'relative isolate -m-4 min-h-screen overflow-hidden bg-background [--form-studio-sticky-top:5rem]',
        FORM_FONT_VARIABLES
      )}
      style={studioBodyFontStyle}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
      >
        <div
          className="absolute inset-0 bg-repeat-y"
          style={{
            backgroundImage: studioLoopGradient,
            backgroundSize: '100% 200vh',
          }}
        />
        <div
          className="absolute inset-0 opacity-80"
          style={{
            backgroundImage: `
              radial-gradient(circle at top center, rgb(var(${studioPrimaryColorVar}) / 0.12), transparent 40%),
              radial-gradient(circle at center 58%, rgb(var(${studioSecondaryColorVar}) / 0.12), transparent 46%)
            `,
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              'linear-gradient(180deg, hsl(var(--background) / 0.1) 0%, transparent 55%, hsl(var(--background) / 0.72) 100%)',
          }}
        />
      </div>
      <div className="relative z-10 mx-auto flex max-w-7xl flex-col gap-8 px-4 py-8">
        <Card
          className={cn(
            'overflow-hidden border-border/60 bg-card/85 shadow-black/5 shadow-xl',
            studioToneClasses.heroClassName
          )}
        >
          <CardContent className="flex flex-col gap-6 p-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-border/60 bg-background/70 px-3 py-1 font-medium text-[11px] text-muted-foreground uppercase tracking-[0.28em]">
                  {t('brand')}
                </span>
                <span className="rounded-full border border-border/60 bg-background/60 px-3 py-1 text-muted-foreground text-xs">
                  {mode === 'create'
                    ? t('studio.new_draft')
                    : t(`status.${values.status}`)}
                </span>
              </div>
              <div className="space-y-2">
                <h1
                  className="max-w-4xl font-semibold text-4xl tracking-tight"
                  style={studioHeadlineFontStyle}
                >
                  {mode === 'create'
                    ? t('studio.create_new_form')
                    : values.title || t('studio.form_studio')}
                </h1>
                <p className="max-w-3xl text-muted-foreground">
                  {t('studio.header_description')}
                </p>
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                <div className="rounded-2xl border border-border/60 bg-background/70 px-4 py-3">
                  <p className="text-[11px] text-muted-foreground uppercase tracking-[0.24em]">
                    {t('tabs.build')}
                  </p>
                  <p className="mt-1 font-semibold text-lg">
                    {values.sections.length} {t('studio.sections_short')}
                  </p>
                </div>
                <div className="rounded-2xl border border-border/60 bg-background/70 px-4 py-3">
                  <p className="text-[11px] text-muted-foreground uppercase tracking-[0.24em]">
                    {t('studio.questions_short')}
                  </p>
                  <p className="mt-1 font-semibold text-lg">{questionCount}</p>
                </div>
                <div className="rounded-2xl border border-border/60 bg-background/70 px-4 py-3">
                  <p className="text-[11px] text-muted-foreground uppercase tracking-[0.24em]">
                    {t('tabs.responses')}
                  </p>
                  <p className="mt-1 font-semibold text-lg">
                    {responseSummary.totalSubmissions}
                  </p>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3 lg:justify-end">
              {mode === 'edit' && shareQuery?.shareLink?.code && (
                <TooltipProvider>
                  <Tooltip delayDuration={0}>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        onClick={handleCopyLink}
                        className={cn(
                          'gap-2 rounded-2xl px-4',
                          studioToneClasses.secondaryButtonClassName
                        )}
                      >
                        {hasCopied ? (
                          <Check className="h-4 w-4 text-dynamic-green" />
                        ) : (
                          <Link className="h-4 w-4" />
                        )}
                        {hasCopied ? tCommon('copied') : t('studio.copy_link')}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{t('studio.copy_link_tooltip')}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              <Button
                ref={primarySaveButtonRef}
                className={cn(
                  'rounded-2xl px-5',
                  studioToneClasses.primaryButtonClassName
                )}
                onClick={handleSave}
                disabled={
                  saveMutation.isPending || (mode === 'edit' && !isDirty)
                }
              >
                {saveMutation.isPending
                  ? t('studio.saving')
                  : mode === 'create'
                    ? t('studio.create_form')
                    : t('studio.save_changes')}
              </Button>
            </div>
          </CardContent>
        </Card>

        {showFloatingSave && (mode === 'create' || isDirty) ? (
          <div className="pointer-events-none fixed right-6 bottom-6 z-50">
            <Button
              type="button"
              onClick={handleSave}
              disabled={saveMutation.isPending || (mode === 'edit' && !isDirty)}
              className={cn(
                'pointer-events-auto rounded-2xl px-5 shadow-black/15 shadow-lg',
                studioToneClasses.primaryButtonClassName
              )}
            >
              {saveMutation.isPending
                ? t('studio.saving')
                : mode === 'create'
                  ? t('studio.create_form')
                  : t('studio.save_changes')}
            </Button>
          </div>
        ) : null}

        <Tabs
          value={activeTab}
          onValueChange={handleTabChange}
          className="space-y-6"
        >
          <div className="sticky top-(--form-studio-sticky-top) z-40 -mx-1 bg-background/80 px-1 backdrop-blur supports-backdrop-filter:bg-background/85">
            <TabsList
              className={cn(
                'grid h-auto w-full grid-cols-5 gap-1 rounded-2xl border border-border/60 p-1 shadow-sm',
                studioToneClasses.tabListClassName
              )}
            >
              <TabsTrigger
                value="build"
                className={studioToneClasses.tabTriggerClassName}
              >
                <LayoutTemplate className="mr-2 h-4 w-4" />
                {t('tabs.build')}
              </TabsTrigger>
              <TabsTrigger
                value="preview"
                className={studioToneClasses.tabTriggerClassName}
              >
                <Eye className="mr-2 h-4 w-4" />
                {t('tabs.preview')}
              </TabsTrigger>
              <TabsTrigger
                value="responses"
                disabled={mode === 'create'}
                className={studioToneClasses.tabTriggerClassName}
              >
                <Table2 className="mr-2 h-4 w-4" />
                {t('tabs.responses')}
                <Badge
                  variant="outline"
                  className="ml-2 rounded-full px-2 py-0"
                >
                  {responseSummary.totalSubmissions}
                </Badge>
              </TabsTrigger>
              <TabsTrigger
                value="analytics"
                disabled={mode === 'create'}
                className={studioToneClasses.tabTriggerClassName}
              >
                <BarChart3 className="mr-2 h-4 w-4" />
                {t('tabs.analytics')}
              </TabsTrigger>
              <TabsTrigger
                value="settings"
                className={studioToneClasses.tabTriggerClassName}
              >
                <Settings2 className="mr-2 h-4 w-4" />
                {t('tabs.settings')}
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="build" className="mt-0">
            <div className="grid items-start gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
              <BuilderSidebar
                values={values}
                activeSectionId={resolvedActiveSectionId}
                onAddSection={addSection}
                onSelectSection={(sectionId) => {
                  setActiveSectionId(sectionId);
                  document
                    .getElementById(`form-section-${sectionId}`)
                    ?.scrollIntoView({
                      behavior: 'smooth',
                      block: 'start',
                    });
                }}
                toneClasses={studioToneClasses}
              />
              <div className="space-y-6">
                <Collapsible
                  open={isFormDetailsOpen}
                  onOpenChange={setIsFormDetailsOpen}
                >
                  <Card className="border-border/60 bg-card/80 shadow-sm">
                    <CollapsibleTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-auto w-full justify-start rounded-3xl px-5 py-4 hover:bg-transparent"
                      >
                        <div className="flex w-full items-start gap-4 text-left">
                          <div className="min-w-0 flex-1 space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-semibold text-base">
                                {t('studio.form_details')}
                              </p>
                              <Badge
                                variant="outline"
                                className="rounded-full px-2 py-0.5 text-[11px]"
                              >
                                {values.theme.coverImage.url ||
                                values.theme.coverImage.storagePath
                                  ? t('studio.cover_set')
                                  : t('studio.cover_not_set')}
                              </Badge>
                              <Badge
                                variant="outline"
                                className="rounded-full px-2 py-0.5 text-[11px]"
                              >
                                {isFormDetailsOpen
                                  ? t('studio.expanded')
                                  : t('studio.collapsed')}
                              </Badge>
                            </div>
                            <p className="line-clamp-2 text-muted-foreground text-sm">
                              {values.description?.trim() ||
                                t('studio.first_impression_hint')}
                            </p>
                          </div>
                          <ChevronDown
                            className={cn(
                              'mt-1 h-4 w-4 shrink-0 transition-transform',
                              isFormDetailsOpen && 'rotate-180'
                            )}
                          />
                        </div>
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="border-border/60 border-t data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
                      <CardContent className="space-y-4 p-5">
                        <div className="space-y-2">
                          <p className="font-medium text-[11px] text-muted-foreground uppercase tracking-[0.3em]">
                            {t('studio.first_impression')}
                          </p>
                          <p className="max-w-2xl text-muted-foreground text-sm">
                            {t('studio.first_impression_hint')}
                          </p>
                        </div>
                        <div className="space-y-2">
                          <Label>{t('studio.form_title')}</Label>
                          <Input
                            {...form.register('title')}
                            placeholder={t('studio.form_title_placeholder')}
                            className={studioToneClasses.fieldClassName}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>{t('studio.description')}</Label>
                          <Textarea
                            {...form.register('description')}
                            placeholder={t(
                              'studio.form_description_placeholder'
                            )}
                            className={cn(
                              'min-h-24',
                              studioToneClasses.fieldClassName
                            )}
                          />
                        </div>
                        <FormMediaField
                          wsId={wsId}
                          scope="cover"
                          value={values.theme.coverImage}
                          onChange={(value) =>
                            form.setValue('theme.coverImage', value, {
                              shouldDirty: true,
                            })
                          }
                          toneClasses={studioToneClasses}
                          label={t('studio.cover_image')}
                          hint={t('studio.cover_image_hint')}
                        />
                      </CardContent>
                    </CollapsibleContent>
                  </Card>
                </Collapsible>

                <DndContext
                  sensors={sectionSensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleSectionDragEnd}
                >
                  <SortableContext
                    items={sectionsArray.fields.map((field) => field.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    {sectionsArray.fields.map((field, sectionIndex) => (
                      <SectionEditor
                        key={field.id}
                        index={sectionIndex}
                        wsId={wsId}
                        sectionId={field.id}
                        isHighlighted={resolvedActiveSectionId === field.id}
                        form={form}
                        toneClasses={studioToneClasses}
                        onRemove={() => sectionsArray.remove(sectionIndex)}
                        onMoveUp={() =>
                          sectionIndex > 0 &&
                          sectionsArray.move(sectionIndex, sectionIndex - 1)
                        }
                        onMoveDown={() =>
                          sectionIndex < sectionsArray.fields.length - 1 &&
                          sectionsArray.move(sectionIndex, sectionIndex + 1)
                        }
                      />
                    ))}
                  </SortableContext>
                </DndContext>

                <LogicRulesEditor form={form} toneClasses={studioToneClasses} />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="preview" className="mt-0">
            <FormRuntime
              data-active="true"
              form={previewDefinition}
              mode="preview"
              className={cn(
                'rounded-xl border',
                studioToneClasses.tabTriggerClassName
              )}
            />
          </TabsContent>

          <TabsContent value="responses" className="mt-0">
            {initialForm ? (
              <ResponsesPanel
                wsId={wsId}
                formId={initialForm.id}
                responses={
                  responsesQuery.data?.records ?? initialResponses ?? []
                }
                total={responsesQuery.data?.total ?? initialResponsesTotal ?? 0}
                summary={responseSummary}
                questionAnalytics={
                  responsesQuery.data?.questionAnalytics ??
                  initialQuestionAnalytics ??
                  []
                }
                onRefresh={() => responsesQuery.refetch()}
                isRefreshing={responsesQuery.isFetching}
              />
            ) : null}
          </TabsContent>

          <TabsContent value="analytics" className="mt-0">
            {initialAnalytics ? (
              <AnalyticsPanel
                wsId={wsId}
                formId={initialForm?.id}
                analytics={analyticsQuery.data ?? initialAnalytics}
                onRefresh={() => analyticsQuery.refetch()}
                isRefreshing={analyticsQuery.isFetching}
              />
            ) : null}
          </TabsContent>

          <TabsContent value="settings" className="mt-0 space-y-6">
            <ThemePickerPanel
              values={values}
              form={form}
              toneClasses={studioToneClasses}
            />
            <FontPreviewPanel
              values={values}
              form={form}
              toneClasses={studioToneClasses}
            />

            <SettingsPanel
              form={form}
              shareCode={shareQuery?.shareLink?.code}
              toneClasses={studioToneClasses}
              onOpenPreview={() => setActiveTab('preview')}
              isDirty={isDirty}
              responseSummary={responseSummary}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
