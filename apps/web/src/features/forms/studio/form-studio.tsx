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
  Copy,
  Eye,
  LayoutTemplate,
  Link,
  MoreHorizontal,
  Plus,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { useFieldArray, useForm, useWatch } from '@tuturuuu/ui/hooks/use-form';
import { Label } from '@tuturuuu/ui/label';
import { zodResolver } from '@tuturuuu/ui/resolvers';
import { toast } from '@tuturuuu/ui/sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { cn } from '@tuturuuu/utils/format';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { parseAsInteger, parseAsString, useQueryState } from 'nuqs';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDebouncedCallback } from 'use-debounce';

import { useUserBooleanConfig } from '@/hooks/use-user-config';
import { FORM_FONT_VARIABLES, getFormFontStyle } from '../fonts';
import { FormRuntime } from '../form-runtime';
import { FormsMarkdown } from '../forms-markdown';
import { FormsRichTextEditor } from '../forms-rich-text-editor';
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
import {
  getBodyTypographyClassName,
  getDisplayTypographyClassName,
} from '../typography';
import { AnalyticsPanel } from './analytics-panel';
import { createQuestionInput } from './block-catalog';
import { FloatingBlockToolbar } from './floating-block-toolbar';
import { FontPreviewPanel } from './font-preview-panel';
import { FormMediaField } from './form-media-field';
import { LogicRulesEditor } from './logic-rules-editor';
import { ResponsesPanel } from './responses-panel';
import { SectionEditor } from './section-editor';
import { SettingsPanel } from './settings-panel';
import {
  createClientId,
  duplicateSectionInput,
  ensureIdentifiers,
  exportFormStudioPayload,
  sanitizeFormStudioPayloadForSave,
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
  canManageForms = true,
  initialForm,
  initialResponses,
  initialResponsesTotal,
  initialResponsesSummary,
  initialResponsesPage = 1,
  initialResponsesPageSize = 10,
  initialQuestionAnalytics,
  initialAnalytics,
}: {
  wsId: string;
  workspaceSlug: string;
  mode: 'create' | 'edit';
  canManageForms?: boolean;
  initialForm?: FormDefinition;
  initialResponses?: FormResponseRecord[];
  initialResponsesTotal?: number;
  initialResponsesSummary?: FormResponseSummary;
  initialResponsesPage?: number;
  initialResponsesPageSize?: number;
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
  const [responsesPage, setResponsesPage] = useQueryState(
    'responsesPage',
    parseAsInteger
      .withDefault(initialResponsesPage)
      .withOptions({ shallow: true })
  );
  const [responsesPageSize] = useQueryState(
    'responsesPageSize',
    parseAsInteger
      .withDefault(initialResponsesPageSize)
      .withOptions({ shallow: true })
  );
  const [hasCopied, setHasCopied] = useState(false);
  const [duplicatePending, setDuplicatePending] = useState(false);
  const { value: autosaveEnabled } = useUserBooleanConfig(
    'FORMS_AUTOSAVE_ENABLED',
    true
  );
  const [autosaveStatus, setAutosaveStatus] = useState<
    'idle' | 'saving' | 'saved' | 'error'
  >('idle');
  const [autosaveScheduledAt, setAutosaveScheduledAt] = useState<number | null>(
    null
  );
  const [secondsUntilAutosave, setSecondsUntilAutosave] = useState(0);
  const [activeSectionId, setActiveSectionId] = useState('');
  const [activeQuestionIdsBySection, setActiveQuestionIdsBySection] = useState<
    Record<string, string>
  >({});
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
  const displayTypographyClassName = getDisplayTypographyClassName(
    values.theme.typography.displaySize
  );
  const bodyTypographyClassName = getBodyTypographyClassName(
    values.theme.typography.bodySize
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
    page: responsesPage,
    pageSize: responsesPageSize,
    enabled: mode === 'edit' && !!initialForm?.id,
    initialData:
      responsesPage === initialResponsesPage &&
      responsesPageSize === initialResponsesPageSize
        ? {
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
          }
        : undefined,
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
  const responseTotal =
    responsesQuery.data?.total ?? initialResponsesTotal ?? 0;
  const totalResponsePages = Math.max(
    1,
    Math.ceil(responseTotal / Math.max(responsesPageSize, 1))
  );

  useEffect(() => {
    if (responsesPage > totalResponsePages) {
      void setResponsesPage(totalResponsePages);
    }
  }, [responsesPage, setResponsesPage, totalResponsePages]);

  const scrollToSection = (sectionId: string) => {
    if (typeof document === 'undefined') {
      return;
    }

    requestAnimationFrame(() => {
      document.getElementById(`form-section-${sectionId}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    });
  };

  const openSection = useCallback((sectionId: string) => {
    setActiveSectionId(sectionId);
    setActiveQuestionIdsBySection((current) => ({
      ...current,
      [sectionId]: '',
    }));
  }, []);

  const setActiveQuestionForSection = useCallback(
    (sectionId: string, questionId: string) => {
      setActiveQuestionIdsBySection((current) => ({
        ...current,
        [sectionId]: questionId,
      }));
    },
    []
  );

  const handleCopyLink = () => {
    if (!shareQuery?.shareLink?.code) return;
    const url = `${window.location.origin}/shared/forms/${shareQuery.shareLink.code}`;
    navigator.clipboard.writeText(url);
    setHasCopied(true);
    setTimeout(() => setHasCopied(false), 2000);
  };

  const handleDuplicate = async () => {
    if (!initialForm?.id) return;
    setDuplicatePending(true);
    try {
      const response = await fetch(
        `/api/v1/workspaces/${workspaceSlug}/forms/${initialForm.id}/copy`,
        { method: 'POST' }
      );
      const payload = (await response.json()) as {
        id?: string;
        error?: string;
      };
      if (!response.ok || !payload.id) {
        toast.error(payload.error ?? t('toast.failed_to_save_form'));
        return;
      }
      toast.success(t('toast.form_duplicated'));
      router.push(`/${workspaceSlug}/forms/${payload.id}`);
    } catch {
      toast.error(t('toast.failed_to_save_form'));
    } finally {
      setDuplicatePending(false);
    }
  };

  const handleExport = () => {
    try {
      const envelope = exportFormStudioPayload(values);
      const blob = new Blob([JSON.stringify(envelope, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      const safeTitle = (values.title || 'form').replace(
        /[^a-zA-Z0-9\s_-]/g,
        ''
      );
      const safeSlug = safeTitle.slice(0, 40).replace(/\s+/g, '-') || 'form';
      anchor.href = url;
      anchor.download = `${safeSlug}-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
      toast.success(t('studio.export_success'));
    } catch {
      toast.error(t('studio.export_failed'));
    }
  };

  const handleImport = (data: FormStudioInput) => {
    form.reset(data);
    setActiveSectionId('');
    setActiveQuestionIdsBySection({});
    const firstSectionId = data.sections[0]?.id ?? '';
    if (firstSectionId) {
      setActiveSectionId(firstSectionId);
      const firstQuestionId = data.sections[0]?.questions[0]?.id ?? '';
      if (firstQuestionId) {
        setActiveQuestionIdsBySection({ [firstSectionId]: firstQuestionId });
      }
    }
    toast.success(t('studio.import_success'));
  };

  const createSectionInput = (
    count: number,
    initialType: Parameters<typeof createQuestionInput>[0] = 'short_text'
  ) => {
    const sectionId = createClientId();
    return {
      id: sectionId,
      title: t('studio.section_number', {
        count,
      }),
      description: '',
      image: {
        storagePath: '',
        url: '',
        alt: '',
      },
      questions: [createQuestionInput(initialType, t)],
    };
  };

  const addSection = (index?: number) => {
    const nextSection = createSectionInput(sectionsArray.fields.length + 1);

    if (typeof index === 'number') {
      sectionsArray.insert(index, nextSection);
    } else {
      sectionsArray.append(nextSection);
    }
    openSection(nextSection.id);
    setActiveQuestionForSection(
      nextSection.id,
      nextSection.questions[0]?.id ?? ''
    );
    scrollToSection(nextSection.id);
  };

  const addBlockToActiveSection = (
    type: Parameters<typeof createQuestionInput>[0]
  ) => {
    if (sectionsArray.fields.length === 0) {
      const nextSection = createSectionInput(1, type);

      sectionsArray.append(nextSection);
      openSection(nextSection.id);
      setActiveQuestionForSection(
        nextSection.id,
        nextSection.questions[0]?.id ?? ''
      );
      scrollToSection(nextSection.id);
      return;
    }

    const targetSectionIndex = Math.max(
      0,
      values.sections.findIndex(
        (section) => section.id === resolvedActiveSectionId
      )
    );
    const targetSectionId =
      values.sections[targetSectionIndex]?.id ?? values.sections[0]?.id ?? '';
    const nextQuestion = createQuestionInput(type, t);
    const targetSection = form.getValues(`sections.${targetSectionIndex}`);

    if (sectionsArray.fields[targetSectionIndex] && targetSection) {
      sectionsArray.update(targetSectionIndex, {
        ...targetSection,
        questions: [...(targetSection.questions ?? []), nextQuestion],
      });
    }

    openSection(targetSectionId);
    setActiveQuestionForSection(targetSectionId, nextQuestion.id);
    scrollToSection(targetSectionId);
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

  useEffect(() => {
    if (
      activeSectionId &&
      !values.sections.some((section) => section.id === activeSectionId)
    ) {
      setActiveSectionId('');
    }

    setActiveQuestionIdsBySection((current) => {
      const nextEntries = values.sections.map((section, sectionIndex) => {
        const sectionId = section.id ?? `section-${sectionIndex}`;
        const currentQuestionId = current[sectionId] ?? '';
        const resolvedQuestionId = section.questions.some(
          (question) => question.id === currentQuestionId
        )
          ? currentQuestionId
          : '';

        return [sectionId, resolvedQuestionId] as const;
      });
      const next: Record<string, string> = Object.fromEntries(nextEntries);

      if (
        Object.keys(next).length === Object.keys(current).length &&
        values.sections.every((section, sectionIndex) => {
          const sectionId = section.id ?? `section-${sectionIndex}`;

          return (current[sectionId] ?? '') === (next[sectionId] ?? '');
        })
      ) {
        return current;
      }

      return next;
    });
  }, [activeSectionId, values.sections]);

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

  const performSave = useCallback(
    async (payload: FormStudioInput, isAutosave: boolean) => {
      const sanitizedPayload = sanitizeFormStudioPayloadForSave(payload);
      const normalizedPayload = ensureIdentifiers(sanitizedPayload);
      const variables = isAutosave
        ? { payload: normalizedPayload, isAutosave: true }
        : normalizedPayload;
      const result = await saveMutation.mutateAsync(variables);

      if (mode === 'create' && result?.id) {
        const nextPath = pathname.endsWith('/new')
          ? `${pathname.slice(0, -4)}/${result.id}`
          : `/${workspaceSlug}/forms/${result.id}`;
        router.replace(nextPath);
        return;
      }

      if (!isAutosave) {
        form.reset(normalizedPayload, { keepValues: true });
      }
      return result;
    },
    [form, mode, pathname, router, saveMutation, workspaceSlug]
  );

  const handleSave = form.handleSubmit(
    async (payload) => {
      try {
        await performSave(payload, false);
      } catch {
        return;
      }
    },
    (errors) => {
      const firstError = findFirstValidationError(errors);
      toast.error(getSaveValidationMessage(firstError));
    }
  );

  const performAutosave = useDebouncedCallback(async () => {
    if (!form.formState.isDirty || saveMutation.isPending) {
      return;
    }
    setAutosaveScheduledAt(null);
    const valid = await form.trigger();
    if (!valid) {
      return;
    }
    const payload = form.getValues();
    setAutosaveStatus('saving');
    try {
      await performSave(payload, true);
      setAutosaveStatus('saved');
    } catch {
      setAutosaveStatus('error');
    }
  }, 2000);

  useEffect(() => {
    if (!autosaveEnabled) {
      setAutosaveScheduledAt(null);
      performAutosave.cancel();
      return;
    }

    const unsubscribe = form.subscribe({
      formState: { values: true },
      callback: () => {
        if (!form.formState.isDirty || saveMutation.isPending) {
          return;
        }
        setAutosaveStatus('idle');
        setAutosaveScheduledAt(Date.now() + 2000);
        performAutosave();
      },
    });

    return () => {
      unsubscribe();
      performAutosave.cancel();
      setAutosaveScheduledAt(null);
    };
  }, [autosaveEnabled, form, performAutosave, saveMutation.isPending]);

  useEffect(() => {
    if (!autosaveEnabled || !form.formState.isDirty) {
      setAutosaveScheduledAt(null);
      performAutosave.cancel();
    }
  }, [autosaveEnabled, form.formState.isDirty, performAutosave]);

  useEffect(() => {
    if (!autosaveScheduledAt) {
      setSecondsUntilAutosave(0);
      return;
    }
    const tick = () => {
      const remaining = Math.max(
        0,
        Math.ceil((autosaveScheduledAt - Date.now()) / 1000)
      );
      setSecondsUntilAutosave(remaining);
      if (remaining <= 0) {
        setAutosaveScheduledAt(null);
      }
    };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [autosaveScheduledAt]);

  const saveButtonDisabled =
    saveMutation.isPending ||
    (mode === 'edit' && (!isDirty || autosaveStatus === 'saved'));

  const handleSectionDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) {
      return;
    }

    const oldIndex = sectionsArray.fields.findIndex(
      (_field, sectionIndex) =>
        (values.sections[sectionIndex]?.id ??
          sectionsArray.fields[sectionIndex]?.id) === active.id
    );
    const newIndex = sectionsArray.fields.findIndex(
      (_field, sectionIndex) =>
        (values.sections[sectionIndex]?.id ??
          sectionsArray.fields[sectionIndex]?.id) === over.id
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

  const SectionDivider = ({ onClick }: { onClick: () => void }) => (
    <div className="group relative flex items-center justify-center py-2">
      <div className="absolute inset-x-0 h-px bg-border/40 transition-colors group-hover:bg-border/60" />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onClick}
        className={cn(
          'relative h-8 gap-2 rounded-full border border-dashed bg-background px-4 opacity-40 transition-all hover:opacity-100',
          studioToneClasses.secondaryButtonClassName
        )}
      >
        <Plus className="h-4 w-4" />
        {t('studio.add_section')}
      </Button>
    </div>
  );

  return (
    <div
      className={cn(
        'relative isolate -m-2 min-h-screen min-w-0 overflow-x-clip bg-background [--form-studio-sticky-top:5rem] md:-m-4',
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
      <div className="relative z-10 mx-auto flex w-full min-w-0 max-w-7xl flex-col gap-8 px-4 py-8">
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
                  className={cn(
                    'max-w-4xl font-semibold tracking-tight',
                    displayTypographyClassName
                  )}
                  style={studioHeadlineFontStyle}
                >
                  {mode === 'create' ? (
                    t('studio.create_new_form')
                  ) : values.title ? (
                    <FormsMarkdown
                      content={values.title}
                      variant="inline"
                      className="[&_p]:m-0"
                    />
                  ) : (
                    t('studio.form_studio')
                  )}
                </h1>
                <p
                  className={cn(
                    'max-w-3xl text-muted-foreground',
                    bodyTypographyClassName
                  )}
                >
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
            <div className="flex flex-wrap items-center gap-2 lg:justify-end">
              {(mode === 'edit' && canManageForms) ||
              (mode === 'edit' && shareQuery?.shareLink?.code) ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className={cn(
                        'h-9 w-9 shrink-0 rounded-2xl',
                        studioToneClasses.secondaryButtonClassName
                      )}
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {mode === 'edit' && canManageForms && (
                      <DropdownMenuItem
                        disabled={duplicatePending}
                        onClick={handleDuplicate}
                      >
                        <Copy className="mr-2 h-4 w-4" />
                        {t('studio.duplicate_form')}
                      </DropdownMenuItem>
                    )}
                    {mode === 'edit' && shareQuery?.shareLink?.code && (
                      <DropdownMenuItem onClick={handleCopyLink}>
                        {hasCopied ? (
                          <Check className="mr-2 h-4 w-4 text-dynamic-green" />
                        ) : (
                          <Link className="mr-2 h-4 w-4" />
                        )}
                        {hasCopied ? tCommon('copied') : t('studio.copy_link')}
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
              <Button
                ref={primarySaveButtonRef}
                className={cn(
                  'rounded-2xl px-5',
                  studioToneClasses.primaryButtonClassName
                )}
                onClick={handleSave}
                disabled={saveButtonDisabled}
              >
                {saveMutation.isPending
                  ? t('studio.saving')
                  : autosaveStatus === 'error'
                    ? t('studio.autosave_failed')
                    : autosaveEnabled && isDirty && secondsUntilAutosave > 0
                      ? t('studio.autosave_in_seconds', {
                          seconds: secondsUntilAutosave,
                        })
                      : autosaveStatus === 'saved'
                        ? t('studio.autosave_saved')
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
              disabled={saveButtonDisabled}
              className={cn(
                'pointer-events-auto rounded-2xl px-5 shadow-black/15 shadow-lg',
                studioToneClasses.primaryButtonClassName
              )}
            >
              {saveMutation.isPending
                ? t('studio.saving')
                : autosaveStatus === 'error'
                  ? t('studio.autosave_failed')
                  : autosaveEnabled && isDirty && secondsUntilAutosave > 0
                    ? t('studio.autosave_in_seconds', {
                        seconds: secondsUntilAutosave,
                      })
                    : autosaveStatus === 'saved'
                      ? t('studio.autosave_saved')
                      : mode === 'create'
                        ? t('studio.create_form')
                        : t('studio.save_changes')}
            </Button>
          </div>
        ) : null}

        <Tabs
          value={activeTab}
          onValueChange={handleTabChange}
          className="min-w-0 space-y-6"
        >
          <div className="sticky top-(--form-studio-sticky-top) z-40 -mx-1 min-w-0 bg-background/80 px-1 backdrop-blur supports-backdrop-filter:bg-background/85">
            <TabsList
              className={cn(
                'grid h-auto w-full max-w-full grid-cols-3 gap-1 rounded-2xl border border-border/60 p-1 shadow-sm sm:flex sm:items-center sm:justify-start sm:overflow-x-auto md:justify-center',
                studioToneClasses.tabListClassName
              )}
            >
              <TabsTrigger
                value="build"
                className={cn(
                  'min-w-0 px-2 text-xs sm:shrink-0 sm:px-3 sm:text-sm',
                  studioToneClasses.tabTriggerClassName
                )}
              >
                <LayoutTemplate className="hidden h-4 w-4 sm:block" />
                {t('tabs.build')}
              </TabsTrigger>
              <TabsTrigger
                value="preview"
                className={cn(
                  'min-w-0 px-2 text-xs sm:shrink-0 sm:px-3 sm:text-sm',
                  studioToneClasses.tabTriggerClassName
                )}
              >
                <Eye className="hidden h-4 w-4 sm:block" />
                {t('tabs.preview')}
              </TabsTrigger>
              <TabsTrigger
                value="responses"
                disabled={mode === 'create'}
                className={cn(
                  'min-w-0 px-2 text-xs sm:shrink-0 sm:px-3 sm:text-sm',
                  studioToneClasses.tabTriggerClassName
                )}
              >
                <Table2 className="hidden h-4 w-4 sm:block" />
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
                className={cn(
                  'min-w-0 px-2 text-xs sm:shrink-0 sm:px-3 sm:text-sm',
                  studioToneClasses.tabTriggerClassName
                )}
              >
                <BarChart3 className="hidden h-4 w-4 sm:block" />
                {t('tabs.analytics')}
              </TabsTrigger>
              <TabsTrigger
                value="settings"
                className={cn(
                  'min-w-0 px-2 text-xs sm:shrink-0 sm:px-3 sm:text-sm',
                  studioToneClasses.tabTriggerClassName
                )}
              >
                <Settings2 className="hidden h-4 w-4 sm:block" />
                {t('tabs.settings')}
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="build" className="mt-0 min-w-0">
            <div className="grid min-w-0 items-start gap-6 lg:grid-cols-1 xl:grid-cols-[72px_minmax(0,1fr)]">
              <FloatingBlockToolbar
                toneClasses={studioToneClasses}
                onAddSection={() => addSection()}
                onAddBlock={addBlockToActiveSection}
              />
              <div className="min-w-0 space-y-6">
                <Collapsible
                  open={isFormDetailsOpen}
                  onOpenChange={setIsFormDetailsOpen}
                >
                  <Card className="border-border/60 bg-card/80 shadow-sm">
                    <CollapsibleTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-auto w-full justify-start whitespace-normal rounded-3xl px-5 py-4 hover:bg-transparent"
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
                            </div>
                            <div className="line-clamp-2 text-muted-foreground text-sm">
                              <FormsMarkdown
                                content={
                                  values.description?.trim() ||
                                  t('studio.first_impression_hint')
                                }
                                variant="inline"
                                className="line-clamp-2"
                              />
                            </div>
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
                          <FormsRichTextEditor
                            value={values.title}
                            onChange={(nextValue) =>
                              form.setValue('title', nextValue, {
                                shouldDirty: true,
                              })
                            }
                            placeholder={t('studio.form_title_placeholder')}
                            toneClasses={studioToneClasses}
                            compact
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>{t('studio.description')}</Label>
                          <FormsRichTextEditor
                            value={values.description}
                            onChange={(nextValue) =>
                              form.setValue('description', nextValue, {
                                shouldDirty: true,
                              })
                            }
                            placeholder={t(
                              'studio.form_description_placeholder'
                            )}
                            toneClasses={studioToneClasses}
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
                  <div className="space-y-4">
                    {sectionsArray.fields.length > 0 && (
                      <SectionDivider onClick={() => addSection(0)} />
                    )}

                    <SortableContext
                      items={sectionsArray.fields.map(
                        (field, sectionIndex) =>
                          values.sections[sectionIndex]?.id ?? field.id
                      )}
                      strategy={verticalListSortingStrategy}
                    >
                      <div className="space-y-4">
                        {sectionsArray.fields.map((field, sectionIndex) => {
                          const sectionFormId =
                            values.sections[sectionIndex]?.id ?? field.id;

                          return (
                            <div key={field.id} className="space-y-4">
                              <SectionEditor
                                index={sectionIndex}
                                wsId={wsId}
                                sectionId={sectionFormId}
                                form={form}
                                open={resolvedActiveSectionId === sectionFormId}
                                onOpenChange={(nextOpen) => {
                                  if (nextOpen) {
                                    openSection(sectionFormId);
                                    return;
                                  }

                                  if (
                                    resolvedActiveSectionId === sectionFormId
                                  ) {
                                    setActiveSectionId('');
                                  }
                                }}
                                activeQuestionId={
                                  activeQuestionIdsBySection[sectionFormId]
                                }
                                onActiveQuestionChange={(questionId) =>
                                  setActiveQuestionForSection(
                                    sectionFormId,
                                    questionId
                                  )
                                }
                                onDuplicate={() => {
                                  const section = form.getValues(
                                    `sections.${sectionIndex}`
                                  );

                                  if (!section) {
                                    return;
                                  }

                                  const nextSection =
                                    duplicateSectionInput(section);
                                  sectionsArray.insert(
                                    sectionIndex + 1,
                                    nextSection
                                  );
                                  openSection(nextSection.id);
                                  scrollToSection(nextSection.id);
                                }}
                                toneClasses={studioToneClasses}
                                onRemove={() => {
                                  sectionsArray.remove(sectionIndex);
                                  if (
                                    resolvedActiveSectionId === sectionFormId
                                  ) {
                                    setActiveSectionId('');
                                  }
                                }}
                                onMoveUp={() =>
                                  sectionIndex > 0 &&
                                  sectionsArray.move(
                                    sectionIndex,
                                    sectionIndex - 1
                                  )
                                }
                                onMoveDown={() =>
                                  sectionIndex <
                                    sectionsArray.fields.length - 1 &&
                                  sectionsArray.move(
                                    sectionIndex,
                                    sectionIndex + 1
                                  )
                                }
                              />
                              <SectionDivider
                                onClick={() => addSection(sectionIndex + 1)}
                              />
                            </div>
                          );
                        })}
                      </div>
                    </SortableContext>

                    {sectionsArray.fields.length === 0 && (
                      <div className="flex flex-col items-center justify-center rounded-3xl border border-border/60 border-dashed bg-background/40 py-12">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className={cn(
                            'h-10 gap-2 rounded-full border-border/60 px-6',
                            studioToneClasses.secondaryButtonClassName
                          )}
                          onClick={() => addSection()}
                        >
                          <Plus className="h-4 w-4" />
                          {t('studio.add_section')}
                        </Button>
                      </div>
                    )}
                  </div>
                </DndContext>

                <LogicRulesEditor form={form} toneClasses={studioToneClasses} />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="preview" className="mt-0 min-w-0">
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

          <TabsContent value="responses" className="mt-0 min-w-0">
            {initialForm ? (
              <ResponsesPanel
                wsId={wsId}
                formId={initialForm.id}
                responses={
                  responsesQuery.data?.records ?? initialResponses ?? []
                }
                total={responseTotal}
                summary={responseSummary}
                page={responsesPage}
                pageSize={responsesPageSize}
                onPageChange={(nextPage) => {
                  void setResponsesPage(nextPage);
                }}
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

          <TabsContent value="analytics" className="mt-0 min-w-0">
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

          <TabsContent value="settings" className="mt-0 min-w-0 space-y-6">
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
              onExport={handleExport}
              onImport={handleImport}
              isDirty={isDirty}
              responseSummary={responseSummary}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
