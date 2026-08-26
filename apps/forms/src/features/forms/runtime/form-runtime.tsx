'use client';

import type { TurnstileInstance } from '@marsidev/react-turnstile';
import { resolveTurnstileClientState } from '@tuturuuu/turnstile/client';

import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';
import { DEV_MODE } from '@/constants/common';
import { isAnswerableQuestionType } from '../block-utils';
import { getNextSectionTarget } from '../branching';
import { normalizeMarkdownToText } from '../content';
import { getFormFontStyle } from '../fonts';
import { FormsImageDialog } from '../forms-image-dialog';
import { getRuntimeProgressStats } from '../runtime-progress';
import { getFormToneClasses } from '../theme';
import type {
  FormAnswerValue,
  FormDefinitionSection,
  FormReadOnlyAnswerIssue,
} from '../types';
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
import { RuntimeShell } from './runtime-shell';
import { renderFormSectionCard } from './section-card';
import {
  findMissingRequiredQuestions,
  scrollToQuestion,
} from './step-validation';
import {
  describeSubmissionFailure,
  scrollToFirstSubmissionError,
} from './submission-errors';
import { renderSubmittedScreen } from './submitted-screen';
import type { FormRuntimeProps } from './types';
import { useAutoAdvance } from './use-auto-advance';
import { useBackNavigation } from './use-back-navigation';
import { useFormAnswers } from './use-form-answers';
import { useFormDraft } from './use-form-draft';
import { useFormSteps } from './use-form-steps';
import { useResponseCopy } from './use-response-copy';
import { useRuntimeKeyboard } from './use-runtime-keyboard';
import { WelcomeScreen } from './welcome-screen';

/**
 * Guards the runtime on a prop, before any hook runs, so every hook in
 * `FormRuntimeContent` is unconditional.
 *
 * The keyboard binding, auto-advance and back navigation were each added below
 * the old mid-component `return null` and each became a conditional hook. Lint
 * caught all three, but a structure that keeps producing the same bug is the
 * bug.
 */
export function FormRuntime(props: FormRuntimeProps) {
  if (props.form.sections.length === 0) {
    return null;
  }

  return <FormRuntimeContent {...props} />;
}

function FormRuntimeContent({
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
  // Breaks a real cycle: answers need auto-advance, auto-advance needs the
  // keyboard's advance handler, and the keyboard reads answers. One of the
  // three has to be late-bound, and this is the cheapest place to do it.
  const maybeAutoAdvanceRef = useRef<
    (questionId: string, value: FormAnswerValue) => void
  >(() => {});

  const [currentSectionId, setCurrentSectionId] = useState(
    form.sections[0]?.id ?? ''
  );
  const [sectionTrail, setSectionTrail] = useState<string[]>(
    form.sections[0]?.id ? [form.sections[0].id] : []
  );
  const [error, setError] = useState<string | null>(null);
  // Drives the direction a new screen slides in from. Kept as state rather than
  // derived from the step index, because moving between sections resets that
  // index and would otherwise animate a forward move as a backward one.
  const [stepDirection, setStepDirection] = useState<'forward' | 'backward'>(
    'forward'
  );
  const [validationErrorsByQuestionId, setValidationErrorsByQuestionId] =
    useState<Record<string, string>>({});

  const { answers, answersRef, setAnswers, updateAnswer } = useFormAnswers({
    initialAnswers: initialAnswers ?? {},
    onAnswered: (questionId, value) =>
      maybeAutoAdvanceRef.current(questionId, value),
    setError,
    setValidationErrorsByQuestionId,
  });
  const [submitted, setSubmitted] = useState(false);
  // The welcome screen is skipped entirely when disabled, and also when the
  // respondent is reviewing an already-submitted response — there is nothing
  // left to introduce.
  const [hasStarted, setHasStarted] = useState(
    () => !form.settings.welcomeEnabled || readOnly || Boolean(submittedAt)
  );
  const [sendResponseCopy, setSendResponseCopy] = useState(false);
  const [submittedResponseCopyEmail, setSubmittedResponseCopyEmail] = useState<
    string | null
  >(null);
  const [submittedResponseCopyStatus, setSubmittedResponseCopyStatus] =
    useState<'sent' | 'rate_limited' | 'failed' | null>(null);
  const [submittedResponseCopyRequested, setSubmittedResponseCopyRequested] =
    useState(false);
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
  const {
    isRequestingResponseCopy,
    requestResponseCopy: handleReadOnlyResponseCopy,
    responseCopySentTo: readOnlyResponseCopySentTo,
  } = useResponseCopy({
    captchaRef,
    captchaToken,
    isBusy: isSubmitting,
    onRequestResponseCopy,
    readOnlyResponseId,
    readOnlyResponseSessionId,
    requiresTurnstile,
    initialSentTo: responseCopyAlreadySent ? responseCopyEmail : null,
    responseCopyEmail,
    setCaptchaToken,
    setError,
    t,
    turnstileSiteKey,
  });
  const currentSectionIndex = form.sections.findIndex(
    (section) => section.id === currentSectionId
  );
  // `FormRuntime` refuses to render this component without at least one
  // section, so the fallback always resolves — TypeScript cannot see that
  // across the boundary.
  const currentSection = (form.sections[currentSectionIndex] ??
    form.sections[0]) as FormDefinitionSection;
  const visibleSectionTitle =
    currentSection?.title ||
    t('studio.section_number', { count: currentSectionIndex + 1 });
  const {
    currentStep,
    goToNextStep,
    goToPreviousStep,
    isFirstStep,
    isLastStep,
    resetSteps,
    stepIndex,
    steps,
  } = useFormSteps({
    displayMode: form.settings.displayMode,
    section: currentSection,
  });
  // In `sections` mode this is the whole section, so every downstream consumer
  // can treat the step as the unit of work without branching on the mode.
  const currentStepQuestions = currentStep?.questions ?? [];
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

  // Scoped to the visible step: in one-question mode, blocking on a required
  // answer the respondent has not been shown yet would strand them.
  const requiredQuestionIds = useMemo(
    () =>
      new Set(
        currentStepQuestions
          .filter(
            (question) =>
              question.required && isAnswerableQuestionType(question.type)
          )
          .map((question) => question.id)
      ),
    [currentStepQuestions]
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
    // `setAnswers` keeps the ref in step now, so this no longer assigns it by
    // hand — two writers to the same ref is how they drift.
    setAnswers(initialAnswers ?? {});
  }, [initialAnswers, setAnswers]);

  useEffect(() => {
    if (responseCopyEmail) {
      return;
    }

    setSendResponseCopy(false);
  }, [responseCopyEmail]);

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

  // Bound above the early return below: a hook that runs on some renders and
  // not others breaks React's hook order.
  const { handlersRef: keyboardHandlersRef } = useRuntimeKeyboard({
    // Off in `sections` mode: with a whole section on screen, Enter would
    // advance past questions the respondent has not reached yet, and the
    // number keys have no single question to apply to.
    enabled:
      form.settings.displayMode === 'one_question' &&
      !isBusy &&
      !submittedAt &&
      hasStarted,
    getAnswer: (questionId) => answersRef.current[questionId],
    setAnswer: (questionId, value) => updateAnswer(questionId, value),
    step: currentStep,
  });

  // Reuses the keyboard's late-bound handler ref: advancing is the same action
  // whether a key or an answer triggered it, and a second ref for it would be
  // one more thing to keep pointed at the right function.
  const handleBack = useBackNavigation({
    goToPreviousStep,
    isBusy,
    resetSteps,
    sectionTrail,
    setCurrentSectionId,
    setError,
    setSectionTrail,
    setStepDirection,
  });

  maybeAutoAdvanceRef.current = useAutoAdvance({
    enabled:
      form.settings.displayMode === 'one_question' &&
      form.settings.autoAdvance &&
      !readOnly,
    onAdvance: () => keyboardHandlersRef.current.next(),
    step: currentStep,
  });

  const validateCurrentSection = (
    currentAnswers: Record<string, FormAnswerValue>
  ) => {
    const missing = findMissingRequiredQuestions(
      currentStepQuestions,
      requiredQuestionIds,
      currentAnswers
    );
    const firstMissing = missing[0];
    if (!firstMissing) return true;

    setError(
      t('runtime.required_before_continue', {
        title: normalizeMarkdownToText(firstMissing.title),
      })
    );
    setValidationErrorsByQuestionId((prev) => ({
      ...prev,
      ...Object.fromEntries(
        missing.map((question) => [question.id, t('runtime.required')])
      ),
    }));
    scrollToQuestion(firstMissing.id);

    return false;
  };

  /**
   * Back walks screens before sections, so a respondent in one-question mode
   * returns to the previous question rather than jumping over the whole
   * section they are partway through.
   */
  const canGoBack = !isFirstStep || sectionTrail.length > 1;

  const handleAdvance = async () => {
    if (isBusy) {
      return;
    }

    const currentAnswers = answersRef.current;

    if (!readOnly && !validateCurrentSection(currentAnswers)) {
      return;
    }

    // One-question mode splits a section into screens. Walk those first;
    // branching only applies once the section is exhausted, which keeps rule
    // evaluation defined per section exactly as it was.
    if (!isLastStep && goToNextStep()) {
      setStepDirection('forward');
      setError(null);
      sectionCardRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
      return;
    }

    const target = readOnly
      ? advanceTarget
      : getNextSectionTarget(form, currentSection.id, currentAnswers);

    if (readOnly) {
      if (target.targetSectionId) {
        resetSteps('first');
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
        setError(describeSubmissionFailure(validation, t));
        scrollToFirstSubmissionError(errors);
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
      resetSteps('first');
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

  // Assigned during render, like `answersRef` above: the keyboard is bound
  // before these exist, and this is what connects the two.
  keyboardHandlersRef.current = {
    next: () => {
      void handleAdvance();
    },
    previous: () => handleBack(),
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

  if (!hasStarted) {
    return (
      <RuntimeShell
        bodyFontStyle={bodyFontStyle}
        className={className}
        toneClasses={toneClasses}
        width="narrow"
      >
        <WelcomeScreen
          bodyTypographyClassName={bodyTypographyClassName}
          displayTypographyClassName={displayTypographyClassName}
          form={form}
          headlineFontStyle={headlineFontStyle}
          onStart={() => setHasStarted(true)}
          t={t}
          toneClasses={toneClasses}
        />
        <FormBrandFooter />
      </RuntimeShell>
    );
  }

  return (
    <RuntimeShell
      bodyFontStyle={bodyFontStyle}
      className={className}
      toneClasses={toneClasses}
    >
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
        canGoBack,
        handleBack,
        visibleQuestions: currentStepQuestions,
        stepIndex,
        stepDirection,
        stepCount: steps.length,
        isLastStep,
        shouldShowTurnstile,
        isSubmitBlockedByTurnstile,
        isBusy,
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
    </RuntimeShell>
  );
}
