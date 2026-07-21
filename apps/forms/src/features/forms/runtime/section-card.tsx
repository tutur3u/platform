'use client';

import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Flag,
  Mail,
  ZoomIn,
} from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader } from '@tuturuuu/ui/card';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import { cn } from '@tuturuuu/utils/format';
import Image from 'next/image';
import type { Dispatch, RefObject, SetStateAction } from 'react';
import { normalizeMarkdownToText } from '../content';
import { FormsMarkdown } from '../forms-markdown';
import type { getRuntimeProgressStats } from '../runtime-progress';
import type {
  FormAnswerValue,
  FormDefinition,
  FormReadOnlyAnswerIssue,
} from '../types';
import type { FormDensityClasses } from './constants';
import { SUPPORT_EMAIL } from './constants';
import { ExpandableDescriptionPanel } from './expandable-description-panel';
import { QuestionBlock } from './question-block';
import type { FormsTranslator, FormToneClasses } from './types';

export function renderFormSectionCard({
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
}: {
  form: FormDefinition;
  t: FormsTranslator;
  mode: 'preview' | 'public';
  readOnly: boolean;
  toneClasses: FormToneClasses;
  density: FormDensityClasses;
  bodyTypographyClassName: string;
  headingTypographyClassName: string;
  sectionCardRef: RefObject<HTMLDivElement | null>;
  currentSection: FormDefinition['sections'][number];
  visibleSectionTitle: string;
  progressStats: ReturnType<typeof getRuntimeProgressStats>;
  answers: Record<string, FormAnswerValue>;
  answerIssueMap: Map<string, FormReadOnlyAnswerIssue[]>;
  validationErrorsByQuestionId: Record<string, string>;
  updateAnswer: (questionId: string, value: FormAnswerValue) => void;
  setPreviewImage: Dispatch<
    SetStateAction<{ src: string; alt: string } | null>
  >;
  error: string | null;
  advanceTarget: {
    type: 'next' | 'section' | 'submit';
    targetSectionId?: string;
  };
  advanceSectionTitle: string | null;
  hasReadOnlyNextSection: boolean;
  shouldShowSectionNavigation: boolean;
  shouldShowTurnstile: boolean;
  isSubmitBlockedByTurnstile: boolean;
  isBusy: boolean;
  sectionTrail: string[];
  setSectionTrail: Dispatch<SetStateAction<string[]>>;
  setCurrentSectionId: Dispatch<SetStateAction<string>>;
  setError: Dispatch<SetStateAction<string | null>>;
  responseCopyEmail?: string | null;
  sendResponseCopy: boolean;
  setSendResponseCopy: Dispatch<SetStateAction<boolean>>;
  turnstileSiteKey?: string;
  captchaRef: RefObject<TurnstileInstance | null>;
  captchaError?: string;
  setCaptchaToken: Dispatch<SetStateAction<string | undefined>>;
  setCaptchaError: Dispatch<SetStateAction<string | undefined>>;
  handleAdvance: () => void;
}) {
  return (
    <Card
      ref={sectionCardRef}
      className={cn('mx-auto w-full border-0', toneClasses.cardClassName)}
    >
      <CardHeader className={density.cardPadding}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <div
              className={cn(
                'font-semibold leading-tight',
                headingTypographyClassName
              )}
            >
              <FormsMarkdown
                content={visibleSectionTitle}
                className="[&_p]:m-0 [&_p]:leading-tight"
              />
            </div>
          </div>
          <Badge variant="outline" className="rounded-full px-3 py-1">
            <Flag className="mr-1 h-3.5 w-3.5" />
            {progressStats.currentSectionNumber} /{' '}
            {progressStats.routeSectionCount}
          </Badge>
        </div>
        {currentSection.image.url ? (
          <div className="relative mt-4 aspect-16/6 overflow-hidden rounded-[1.4rem] border border-border/60 bg-background/70">
            <Image
              src={currentSection.image.url}
              alt={
                currentSection.image.alt ||
                normalizeMarkdownToText(currentSection.title) ||
                normalizeMarkdownToText(visibleSectionTitle)
              }
              fill
              unoptimized
              className="object-cover"
            />
            <Button
              type="button"
              size="icon"
              variant="secondary"
              className="absolute top-4 right-4 h-10 w-10 rounded-full bg-background/85 shadow-sm backdrop-blur-sm"
              onClick={() =>
                setPreviewImage({
                  src: currentSection.image.url,
                  alt:
                    currentSection.image.alt ||
                    normalizeMarkdownToText(currentSection.title) ||
                    normalizeMarkdownToText(visibleSectionTitle),
                })
              }
            >
              <ZoomIn className="h-4 w-4" />
              <span className="sr-only">
                {t('runtime.view_image_fullscreen')}
              </span>
            </Button>
          </div>
        ) : null}
      </CardHeader>
      <CardContent className={cn(density.cardPadding, density.sectionGap)}>
        {currentSection.description ? (
          <div className="rounded-[1.45rem] border border-border/60 bg-background/45 p-4 sm:p-5">
            <ExpandableDescriptionPanel
              content={currentSection.description}
              className={bodyTypographyClassName}
            />
          </div>
        ) : null}
        <div className={density.questionGap}>
          {currentSection.questions.map((question) => (
            <QuestionBlock
              key={question.id}
              question={question}
              value={answers[question.id]}
              onChange={(value) => updateAnswer(question.id, value)}
              onImagePreview={(image) => setPreviewImage(image)}
              disabled={isBusy || readOnly}
              validationError={validationErrorsByQuestionId[question.id]}
              toneClasses={toneClasses}
              typography={form.theme.typography}
            />
          ))}
          {readOnly &&
          currentSection.questions.some(
            (question) => (answerIssueMap.get(question.id) ?? []).length > 0
          )
            ? currentSection.questions.map((question) => {
                const issues = answerIssueMap.get(question.id) ?? [];
                if (issues.length === 0) {
                  return null;
                }

                return (
                  <div
                    key={`${question.id}-unmatched`}
                    className="rounded-2xl border border-dynamic-orange/20 bg-dynamic-orange/8 px-4 py-3 text-sm"
                  >
                    <p className="font-medium text-dynamic-orange">
                      {question.title}
                    </p>
                    {issues.map((issue, index) => (
                      <p
                        key={`${question.id}-${issue.originalAnswer}-${index}`}
                        className="mt-1 text-muted-foreground"
                      >
                        {t('runtime.unmatched_answer_hint', {
                          value: issue.originalAnswer,
                        })}
                      </p>
                    ))}
                  </div>
                );
              })
            : null}
        </div>

        {error ? (
          <div className="rounded-2xl border border-dynamic-red/25 bg-dynamic-red/10 px-4 py-3 text-dynamic-red text-sm">
            {Object.keys(validationErrorsByQuestionId).length > 0
              ? t('runtime.validation_fix_errors')
              : error}
          </div>
        ) : null}

        {mode === 'public' && !readOnly && advanceTarget.type === 'submit' ? (
          <div className="rounded-3xl border border-border/60 bg-linear-to-br from-background/90 via-background/70 to-background/45 p-5 shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div
                    className={cn(
                      'flex h-10 w-10 items-center justify-center rounded-2xl',
                      toneClasses.iconClassName
                    )}
                  >
                    <Mail className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">
                      {t('runtime.response_copy_title')}
                    </p>
                    <p className="text-muted-foreground text-sm">
                      {t('runtime.response_copy_description')}
                    </p>
                  </div>
                </div>
                {responseCopyEmail ? (
                  <div className="inline-flex rounded-full border border-border/60 bg-background/80 px-3 py-1.5 font-medium text-xs">
                    {t('runtime.response_copy_email_badge', {
                      email: responseCopyEmail,
                    })}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm leading-6">
                    {t('runtime.response_copy_unavailable')}
                  </p>
                )}
              </div>

              <label
                className={cn(
                  'flex min-w-60 items-start gap-3 rounded-[1.3rem] border border-border/60 bg-background/75 p-4 text-left transition-colors',
                  !responseCopyEmail && 'opacity-70'
                )}
              >
                <Checkbox
                  checked={sendResponseCopy}
                  onCheckedChange={(checked) =>
                    setSendResponseCopy(checked === true)
                  }
                  disabled={!responseCopyEmail || isBusy}
                  className="mt-0.5"
                />
                <div className="space-y-1">
                  <p className="font-medium text-sm">
                    {t('runtime.response_copy_checkbox')}
                  </p>
                  <p className="text-muted-foreground text-xs leading-5">
                    {responseCopyEmail
                      ? t('runtime.response_copy_once_only')
                      : t('runtime.response_copy_login_required_hint')}
                  </p>
                </div>
              </label>
            </div>
            <p className="mt-4 text-muted-foreground text-xs leading-6">
              {t('runtime.response_copy_support_note', {
                email: SUPPORT_EMAIL,
              })}
            </p>
          </div>
        ) : null}

        {shouldShowTurnstile ? (
          <div className="space-y-3 rounded-[1.4rem] border border-border/60 bg-background/60 p-4">
            <div className="space-y-1">
              <p className="font-medium text-sm">
                {t('runtime.turnstile_title')}
              </p>
              <p className="text-muted-foreground text-xs">
                {t('runtime.turnstile_description')}
              </p>
            </div>
            {turnstileSiteKey ? (
              <Turnstile
                ref={captchaRef}
                siteKey={turnstileSiteKey}
                onSuccess={(token) => {
                  setCaptchaToken(token);
                  setCaptchaError(undefined);
                  setError(null);
                }}
                onExpire={() => {
                  setCaptchaToken(undefined);
                }}
                onError={() => {
                  setCaptchaToken(undefined);
                  setCaptchaError(t('runtime.turnstile_failed'));
                }}
              />
            ) : (
              <div className="rounded-2xl border border-dynamic-orange/20 bg-dynamic-orange/10 px-4 py-3 text-dynamic-orange text-sm">
                {t('runtime.turnstile_not_configured')}
              </div>
            )}
            {captchaError ? (
              <p className="text-destructive text-sm">{captchaError}</p>
            ) : null}
          </div>
        ) : null}

        {shouldShowSectionNavigation ? (
          <div className="relative z-10 flex flex-col gap-3 border-border/50 border-t pt-6 sm:flex-row sm:items-center sm:justify-between">
            <Button
              type="button"
              variant="outline"
              className={toneClasses.secondaryButtonClassName}
              onClick={() => {
                const previousSectionId = sectionTrail[sectionTrail.length - 2];
                if (!previousSectionId) {
                  return;
                }

                setSectionTrail((currentTrail) => currentTrail.slice(0, -1));
                setCurrentSectionId(previousSectionId);
              }}
              disabled={sectionTrail.length <= 1 || isBusy}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              {t('runtime.back')}
            </Button>
            <div className="flex flex-col items-stretch gap-2 sm:items-end">
              {advanceSectionTitle ? (
                <div className="rounded-full border border-border/60 bg-background/60 px-3 py-1 text-[11px] text-muted-foreground uppercase tracking-[0.2em]">
                  {t('studio.target_section')}: {advanceSectionTitle}
                </div>
              ) : null}
              {!readOnly || hasReadOnlyNextSection ? (
                <Button
                  type="button"
                  className={toneClasses.primaryButtonClassName}
                  onClick={handleAdvance}
                  disabled={isBusy || isSubmitBlockedByTurnstile}
                >
                  {advanceTarget.type === 'submit' ? (
                    <>
                      <Check className="mr-2 h-4 w-4" />
                      {mode === 'preview'
                        ? t('runtime.finish_preview')
                        : t('runtime.submit_response')}
                    </>
                  ) : (
                    <>
                      {t('runtime.continue')}
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </>
                  )}
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
