'use client';

import type { TurnstileInstance } from '@marsidev/react-turnstile';
import { resolveTurnstileClientState } from '@tuturuuu/turnstile/client';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';
import { DEV_MODE } from '@/constants/common';
import { isAnswerableQuestionType } from '../block-utils';
import { getNextSectionTarget } from '../branching';
import { normalizeMarkdownToText } from '../content';
import { FORM_FONT_VARIABLES, getFormFontStyle } from '../fonts';
import { FormsImageDialog } from '../forms-image-dialog';
import { getRuntimeProgressStats } from '../runtime-progress';
import { getFormToneClasses } from '../theme';
import type { FormAnswerValue, FormReadOnlyAnswerIssue } from '../types';
import {
  getBodyTypographyClassName,
  getDisplayTypographyClassName,
  getHeadingTypographyClassName,
} from '../typography';
import { validateSubmittedAnswers } from '../validation';
import { densityClasses } from './constants';
import { FormBrandFooter } from './form-brand-footer';
import { renderFormHeroCard } from './hero-card';
import { renderEmailTrackedNotice, renderReadOnlyNotice } from './notices';
import { renderFormSectionCard } from './section-card';
import { renderSubmittedScreen } from './submitted-screen';
import type { FormRuntimeProps } from './types';
import { useFormDraft } from './use-form-draft';

export function FormRuntime({
  form,
  mode,
  initialAnswers,
  answerIssues = [],
  submittedAt,
  responseCopyEmail,
  readOnlyResponseId,
  readOnlyResponseSessionId,
  canRequestResponseCopy = false,
  responseCopyAlreadySent = false,
  onSubmit,
  onRequestResponseCopy,
  isSubmitting = false,
  readOnly = false,
  className,
}: FormRuntimeProps) {
  const t = useTranslations('forms');
  const [answers, setAnswers] = useState<Record<string, FormAnswerValue>>(
    initialAnswers ?? {}
  );
  const answersRef = useRef<Record<string, FormAnswerValue>>(
    initialAnswers ?? {}
  );
  const [currentSectionId, setCurrentSectionId] = useState(
    form.sections[0]?.id ?? ''
  );
  const [sectionTrail, setSectionTrail] = useState<string[]>(
    form.sections[0]?.id ? [form.sections[0].id] : []
  );
  const [error, setError] = useState<string | null>(null);
  const [validationErrorsByQuestionId, setValidationErrorsByQuestionId] =
    useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [sendResponseCopy, setSendResponseCopy] = useState(false);
  const [submittedResponseCopyEmail, setSubmittedResponseCopyEmail] = useState<
    string | null
  >(null);
  const [submittedResponseCopyStatus, setSubmittedResponseCopyStatus] =
    useState<'sent' | 'rate_limited' | 'failed' | null>(null);
  const [submittedResponseCopyRequested, setSubmittedResponseCopyRequested] =
    useState(false);
  const [isRequestingResponseCopy, setIsRequestingResponseCopy] =
    useState(false);
  const [readOnlyResponseCopySentTo, setReadOnlyResponseCopySentTo] = useState<
    string | null
  >(responseCopyAlreadySent ? (responseCopyEmail ?? null) : null);
  const [captchaToken, setCaptchaToken] = useState<string>();
  const [captchaError, setCaptchaError] = useState<string>();
  const [previewImage, setPreviewImage] = useState<{
    src: string;
    alt: string;
  } | null>(null);
  const captchaRef = useRef<TurnstileInstance | null>(null);
  const sectionCardRef = useRef<HTMLDivElement | null>(null);
  const previousSectionIdRef = useRef(currentSectionId);

  const toneClasses = getFormToneClasses(form.theme.accentColor);
  const bodyFontStyle = getFormFontStyle(form.theme.bodyFontId);
  const headlineFontStyle = getFormFontStyle(form.theme.headlineFontId);
  const displayTypographyClassName = getDisplayTypographyClassName(
    form.theme.typography.displaySize
  );
  const headingTypographyClassName = getHeadingTypographyClassName(
    form.theme.typography.headingSize
  );
  const bodyTypographyClassName = getBodyTypographyClassName(
    form.theme.typography.bodySize
  );
  const density = densityClasses[form.theme.density];
  const turnstileClientState = resolveTurnstileClientState({
    devMode: DEV_MODE,
    siteKey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
  });
  const turnstileSiteKey = turnstileClientState.siteKey;
  const requiresTurnstile =
    mode === 'public' && turnstileClientState.isRequired;
  const currentSectionIndex = form.sections.findIndex(
    (section) => section.id === currentSectionId
  );
  const currentSection = form.sections[currentSectionIndex] ?? form.sections[0];
  const visibleSectionTitle =
    currentSection?.title ||
    t('studio.section_number', { count: currentSectionIndex + 1 });
  const activeAnswers = answersRef.current;
  const progressStats = useMemo(
    () =>
      getRuntimeProgressStats(
        form,
        answers,
        sectionTrail,
        currentSection?.id ?? ''
      ),
    [answers, currentSection?.id, form, sectionTrail]
  );

  const requiredQuestionIds = useMemo(
    () =>
      new Set(
        currentSection?.questions
          .filter(
            (question) =>
              question.required && isAnswerableQuestionType(question.type)
          )
          .map((question) => question.id)
      ),
    [currentSection]
  );
  const advanceTarget = currentSection
    ? readOnly
      ? form.sections[currentSectionIndex + 1]
        ? {
            type: 'next' as const,
            targetSectionId: form.sections[currentSectionIndex + 1]?.id,
          }
        : { type: 'submit' as const }
      : getNextSectionTarget(form, currentSection.id, activeAnswers)
    : { type: 'submit' as const };
  const advanceSectionTitle =
    advanceTarget.type === 'section'
      ? normalizeMarkdownToText(
          form.sections.find(
            (section) => section.id === advanceTarget.targetSectionId
          )?.title
        )
      : advanceTarget.type === 'next'
        ? normalizeMarkdownToText(form.sections[currentSectionIndex + 1]?.title)
        : null;
  const questionIdSet = useMemo(
    () =>
      new Set(
        form.sections.flatMap((section) =>
          section.questions.map((question) => question.id)
        )
      ),
    [form.sections]
  );
  const answerIssueMap = useMemo(
    () =>
      answerIssues.reduce<Map<string, FormReadOnlyAnswerIssue[]>>(
        (accumulator, issue) => {
          if (!issue.questionId || !questionIdSet.has(issue.questionId)) {
            return accumulator;
          }

          const currentIssues = accumulator.get(issue.questionId) ?? [];
          currentIssues.push(issue);
          accumulator.set(issue.questionId, currentIssues);
          return accumulator;
        },
        new Map()
      ),
    [answerIssues, questionIdSet]
  );
  const missingQuestionIssues = useMemo(
    () =>
      answerIssues.filter(
        (issue) => !issue.questionId || !questionIdSet.has(issue.questionId)
      ),
    [answerIssues, questionIdSet]
  );
  const hasReadOnlyNextSection =
    readOnly && Boolean(advanceTarget.targetSectionId);
  const canTriggerReadOnlyResponseCopy = Boolean(
    readOnly &&
      canRequestResponseCopy &&
      onRequestResponseCopy &&
      readOnlyResponseId &&
      readOnlyResponseSessionId &&
      !readOnlyResponseCopySentTo
  );
  const shouldShowTurnstile =
    requiresTurnstile &&
    ((!readOnly && advanceTarget.type === 'submit') ||
      canTriggerReadOnlyResponseCopy);
  const shouldShowSectionNavigation =
    !readOnly || sectionTrail.length > 1 || hasReadOnlyNextSection;
  const isSubmitBlockedByTurnstile =
    !readOnly && shouldShowTurnstile && !captchaToken;
  const isResponseCopyBlockedByTurnstile =
    readOnly &&
    canTriggerReadOnlyResponseCopy &&
    requiresTurnstile &&
    !captchaToken;
  const isBusy = isSubmitting || isRequestingResponseCopy;

  const draftKey = `tuturuuu_form_draft_${form.id}`;

  useFormDraft({
    draftKey,
    form,
    mode,
    readOnly,
    submittedAt,
    isSubmitting,
    initialAnswers,
    answers,
    answersRef,
    currentSectionId,
    sectionTrail,
    setAnswers,
    setCurrentSectionId,
    setSectionTrail,
  });

  useEffect(() => {
    const nextAnswers = initialAnswers ?? {};
    answersRef.current = nextAnswers;
    setAnswers(nextAnswers);
  }, [initialAnswers]);

  useEffect(() => {
    if (responseCopyEmail) {
      return;
    }

    setSendResponseCopy(false);
  }, [responseCopyEmail]);

  useEffect(() => {
    setReadOnlyResponseCopySentTo(
      responseCopyAlreadySent ? (responseCopyEmail ?? null) : null
    );
  }, [responseCopyAlreadySent, responseCopyEmail]);

  useEffect(() => {
    if (shouldShowTurnstile) {
      return;
    }

    setCaptchaToken(undefined);
    setCaptchaError(undefined);
    captchaRef.current?.reset();
  }, [shouldShowTurnstile]);

  useEffect(() => {
    if (previousSectionIdRef.current === currentSectionId) {
      return;
    }

    previousSectionIdRef.current = currentSectionId;
    requestAnimationFrame(() => {
      sectionCardRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    });
  }, [currentSectionId]);

  if (!currentSection) {
    return null;
  }

  const updateAnswer = (questionId: string, value: FormAnswerValue) => {
    const nextAnswers = {
      ...answersRef.current,
      [questionId]: value,
    };

    answersRef.current = nextAnswers;
    setAnswers(nextAnswers);
    setError(null);
    setValidationErrorsByQuestionId((prev) => {
      if (!(questionId in prev)) return prev;
      const next = { ...prev };
      delete next[questionId];
      return next;
    });
  };

  const validateCurrentSection = (
    currentAnswers: Record<string, FormAnswerValue>
  ) => {
    const missingRequiredQuestions =
      currentSection?.questions.filter((question) => {
        if (!requiredQuestionIds.has(question.id)) {
          return false;
        }

        const value = currentAnswers[question.id];
        if (Array.isArray(value)) {
          return value.length === 0;
        }

        return value == null || value === '';
      }) ?? [];

    if (missingRequiredQuestions.length > 0) {
      const firstMissing = missingRequiredQuestions[0]!;
      setError(
        t('runtime.required_before_continue', {
          title: normalizeMarkdownToText(firstMissing.title),
        })
      );

      const nextErrors: Record<string, string> = {};
      for (const question of missingRequiredQuestions) {
        nextErrors[question.id] = t('runtime.required');
      }

      setValidationErrorsByQuestionId((prev) => ({
        ...prev,
        ...nextErrors,
      }));

      // Scroll to the first missing required question
      requestAnimationFrame(() => {
        const element = document.getElementById(`question-${firstMissing.id}`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      });

      return false;
    }

    return true;
  };

  const handleAdvance = async () => {
    if (isBusy) {
      return;
    }

    const currentAnswers = answersRef.current;

    if (!readOnly && !validateCurrentSection(currentAnswers)) {
      return;
    }

    const target = readOnly
      ? advanceTarget
      : getNextSectionTarget(form, currentSection.id, currentAnswers);

    if (readOnly) {
      if (target.targetSectionId) {
        setCurrentSectionId(target.targetSectionId);
        setSectionTrail((currentTrail) =>
          currentTrail.at(-1) === target.targetSectionId
            ? currentTrail
            : [...currentTrail, target.targetSectionId!]
        );
        setError(null);
      }
      return;
    }

    if (target.type === 'submit') {
      const validation = validateSubmittedAnswers(form, currentAnswers);
      if (!validation.valid) {
        const errors = validation.validationErrorsByQuestionId ?? {};
        setValidationErrorsByQuestionId(errors);

        if (validation.missingRequired.length > 0) {
          setError(
            t('runtime.missing_required_answers', {
              items: validation.missingRequired.join(', '),
            })
          );
        } else if (validation.validationErrors.length > 0) {
          setError(validation.validationErrors[0] ?? null);
        } else {
          setError(null);
        }

        // Scroll to the first error if it's in the current section
        const firstErrorId = Object.keys(errors)[0];
        if (firstErrorId) {
          requestAnimationFrame(() => {
            const element = document.getElementById(`question-${firstErrorId}`);
            if (element) {
              element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
          });
        }

        return;
      }

      if (!onSubmit) {
        setSubmitted(true);
        return;
      }

      if (requiresTurnstile && !turnstileSiteKey) {
        setError(t('runtime.turnstile_not_configured'));
        return;
      }

      if (requiresTurnstile && !captchaToken) {
        setError(t('runtime.turnstile_required'));
        return;
      }

      const submitResult = await onSubmit({
        answers: currentAnswers,
        turnstileToken: captchaToken,
        sendResponseCopy: Boolean(responseCopyEmail && sendResponseCopy),
      });

      try {
        localStorage.removeItem(draftKey);
      } catch (err) {
        console.warn('Failed to clear form draft from local storage', err);
      }

      captchaRef.current?.reset();
      setCaptchaToken(undefined);
      setSubmittedResponseCopyRequested(
        submitResult?.responseCopyRequested ??
          Boolean(responseCopyEmail && sendResponseCopy)
      );
      setSubmittedResponseCopyStatus(
        submitResult?.responseCopyStatus ??
          (submitResult?.responseCopySentTo ? 'sent' : null)
      );
      setSubmittedResponseCopyEmail(submitResult?.responseCopySentTo ?? null);
      setSubmitted(true);
      return;
    }

    if (target.targetSectionId) {
      setCurrentSectionId(target.targetSectionId);
      setSectionTrail((currentTrail) =>
        currentTrail.at(-1) === target.targetSectionId
          ? currentTrail
          : [...currentTrail, target.targetSectionId!]
      );
      setError(null);
      setValidationErrorsByQuestionId({});
    }
  };

  const handleReadOnlyResponseCopy = async () => {
    if (
      isBusy ||
      !onRequestResponseCopy ||
      !readOnlyResponseId ||
      !readOnlyResponseSessionId
    ) {
      return;
    }

    if (requiresTurnstile && !turnstileSiteKey) {
      setError(t('runtime.turnstile_not_configured'));
      return;
    }

    if (requiresTurnstile && !captchaToken) {
      setError(t('runtime.turnstile_required'));
      return;
    }

    setIsRequestingResponseCopy(true);
    setError(null);

    try {
      const result = await onRequestResponseCopy({
        responseId: readOnlyResponseId,
        sessionId: readOnlyResponseSessionId,
        turnstileToken: captchaToken,
      });

      setReadOnlyResponseCopySentTo(
        result?.responseCopySentTo ?? responseCopyEmail ?? null
      );
      captchaRef.current?.reset();
      setCaptchaToken(undefined);
    } finally {
      setIsRequestingResponseCopy(false);
    }
  };

  if (submitted) {
    return renderSubmittedScreen({
      form,
      t,
      className,
      toneClasses,
      bodyFontStyle,
      headlineFontStyle,
      displayTypographyClassName,
      bodyTypographyClassName,
      submittedResponseCopyEmail,
      submittedResponseCopyRequested,
      submittedResponseCopyStatus,
    });
  }

  return (
    <div
      className={cn(
        'min-h-screen py-10',
        FORM_FONT_VARIABLES,
        toneClasses.pageClassName,
        className
      )}
      style={bodyFontStyle}
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-8 px-4">
        {renderFormHeroCard({
          form,
          t,
          toneClasses,
          headlineFontStyle,
          displayTypographyClassName,
          progressStats,
          setPreviewImage,
        })}

        {renderEmailTrackedNotice({ form, t })}

        {renderReadOnlyNotice({
          t,
          readOnly,
          toneClasses,
          submittedAt,
          responseCopyEmail,
          readOnlyResponseCopySentTo,
          canTriggerReadOnlyResponseCopy,
          isBusy,
          isResponseCopyBlockedByTurnstile,
          handleReadOnlyResponseCopy,
          missingQuestionIssues,
        })}

        {renderFormSectionCard({
          form,
          t,
          mode,
          readOnly,
          toneClasses,
          density,
          bodyTypographyClassName,
          headingTypographyClassName,
          sectionCardRef,
          currentSection,
          visibleSectionTitle,
          progressStats,
          answers,
          answerIssueMap,
          validationErrorsByQuestionId,
          updateAnswer,
          setPreviewImage,
          error,
          advanceTarget,
          advanceSectionTitle,
          hasReadOnlyNextSection,
          shouldShowSectionNavigation,
          shouldShowTurnstile,
          isSubmitBlockedByTurnstile,
          isBusy,
          sectionTrail,
          setSectionTrail,
          setCurrentSectionId,
          setError,
          responseCopyEmail,
          sendResponseCopy,
          setSendResponseCopy,
          turnstileSiteKey,
          captchaRef,
          captchaError,
          setCaptchaToken,
          setCaptchaError,
          handleAdvance,
        })}
        <FormBrandFooter className="pb-2" />
        {previewImage ? (
          <FormsImageDialog
            open={!!previewImage}
            onOpenChange={(open) => {
              if (!open) {
                setPreviewImage(null);
              }
            }}
            src={previewImage.src}
            alt={previewImage.alt}
          />
        ) : null}
      </div>
    </div>
  );
}
