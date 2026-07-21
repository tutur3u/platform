'use client';

import { PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { useFieldArray, useForm, useWatch } from '@tuturuuu/ui/hooks/use-form';
import { zodResolver } from '@tuturuuu/ui/resolvers';
import { toast } from '@tuturuuu/ui/sonner';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { parseAsInteger, parseAsString, useQueryState } from 'nuqs';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useUserBooleanConfig } from '@/hooks/use-user-config';
import { getFormFontStyle } from '../fonts';
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
import { createQuestionInput } from './block-catalog';
import { STUDIO_PAGE_GRADIENT_VARS } from './form-studio-constants';
import {
  createClientId,
  exportFormStudioPayload,
  toPreviewDefinition,
  toStudioInput,
} from './studio-utils';

export function useFormStudioState({
  wsId,
  workspaceSlug,
  mode,
  initialForm,
  initialResponses,
  initialResponsesTotal,
  initialResponsesSummary,
  initialResponsesPage,
  initialResponsesPageSize,
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
  initialResponsesPage: number;
  initialResponsesPageSize: number;
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

  return {
    t,
    tCommon,
    pathname,
    router,
    saveMutation,
    activeTab,
    setActiveTab,
    responsesPage,
    setResponsesPage,
    responsesPageSize,
    hasCopied,
    duplicatePending,
    autosaveEnabled,
    autosaveStatus,
    setAutosaveStatus,
    autosaveScheduledAt,
    setAutosaveScheduledAt,
    secondsUntilAutosave,
    setSecondsUntilAutosave,
    activeSectionId,
    setActiveSectionId,
    activeQuestionIdsBySection,
    isFormDetailsOpen,
    setIsFormDetailsOpen,
    showFloatingSave,
    setShowFloatingSave,
    primarySaveButtonRef,
    form,
    values,
    isDirty,
    questionCount,
    displayTypographyClassName,
    bodyTypographyClassName,
    previewDefinition,
    sectionsArray,
    sectionSensors,
    studioToneClasses,
    studioBodyFontStyle,
    studioHeadlineFontStyle,
    studioPrimaryColorVar,
    studioSecondaryColorVar,
    studioLoopGradient,
    shareQuery,
    responsesQuery,
    analyticsQuery,
    responseSummary,
    resolvedActiveSectionId,
    responseTotal,
    scrollToSection,
    openSection,
    setActiveQuestionForSection,
    handleCopyLink,
    handleDuplicate,
    handleExport,
    handleImport,
    addSection,
    addBlockToActiveSection,
    handleTabChange,
  };
}

export type FormStudioState = ReturnType<typeof useFormStudioState>;
