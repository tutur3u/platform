'use client';

import { Check, Mail } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { cn } from '@tuturuuu/utils/format';
import type { FormDefinition, FormReadOnlyAnswerIssue } from '../types';
import { SUPPORT_EMAIL } from './constants';
import type { FormsTranslator, FormToneClasses } from './types';

export function renderEmailTrackedNotice({
  form,
  t,
}: {
  form: FormDefinition;
  t: FormsTranslator;
}) {
  return form.accessMode === 'authenticated_email' ? (
    <div className="mx-auto flex w-full max-w-5xl items-center gap-3 rounded-2xl border border-border/50 bg-card/60 px-5 py-3 text-muted-foreground text-sm">
      <Mail className="h-4 w-4 shrink-0" />
      {t('runtime.email_tracked_notice')}
    </div>
  ) : null;
}

export function renderReadOnlyNotice({
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
}: {
  t: FormsTranslator;
  readOnly: boolean;
  toneClasses: FormToneClasses;
  submittedAt?: string | null;
  responseCopyEmail?: string | null;
  readOnlyResponseCopySentTo: string | null;
  canTriggerReadOnlyResponseCopy: boolean;
  isBusy: boolean;
  isResponseCopyBlockedByTurnstile: boolean;
  handleReadOnlyResponseCopy: () => void;
  missingQuestionIssues: FormReadOnlyAnswerIssue[];
}) {
  return readOnly ? (
    <div className="mx-auto w-full max-w-5xl space-y-3">
      <div className="flex items-start gap-3 rounded-2xl border border-dynamic-orange/20 bg-dynamic-orange/10 px-5 py-3 text-dynamic-orange text-sm">
        <Check className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="space-y-1">
          <p>{t('runtime.already_responded')}</p>
          {submittedAt ? (
            <p className="text-xs opacity-80">
              {t('runtime.response_recorded_at', {
                time: new Date(submittedAt).toLocaleString(),
              })}
            </p>
          ) : null}
        </div>
      </div>
      {readOnlyResponseCopySentTo ? (
        <div className="flex items-center gap-2 rounded-2xl border border-dynamic-green/20 bg-dynamic-green/8 px-4 py-3 text-sm">
          <Check className="h-4 w-4 shrink-0 text-dynamic-green" />
          <p className="text-muted-foreground leading-6">
            {t('runtime.response_copy_sent_description', {
              email: readOnlyResponseCopySentTo,
            })}
          </p>
        </div>
      ) : (
        <div className="rounded-[1.65rem] border border-border/60 bg-linear-to-br from-background/95 via-background/80 to-background/55 p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div
                  className={cn(
                    'flex h-10 w-10 items-center justify-center rounded-2xl',
                    toneClasses.iconClassName
                  )}
                >
                  <Mail className="h-4 w-4" />
                </div>
                <div className="space-y-1">
                  <p className="font-medium text-sm">
                    {t('runtime.response_copy_title')}
                  </p>
                  <p className="text-muted-foreground text-sm leading-6">
                    {t('runtime.response_copy_read_only_description')}
                  </p>
                </div>
              </div>
              {responseCopyEmail ? (
                <div className="inline-flex rounded-full border border-border/60 bg-background/85 px-3 py-1.5 font-medium text-xs">
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

            <div className="flex min-w-62 flex-col items-stretch gap-3 lg:max-w-xs">
              <Button
                type="button"
                className={toneClasses.primaryButtonClassName}
                onClick={handleReadOnlyResponseCopy}
                disabled={
                  !canTriggerReadOnlyResponseCopy ||
                  isBusy ||
                  isResponseCopyBlockedByTurnstile
                }
              >
                <Mail className="mr-2 h-4 w-4" />
                {t('runtime.response_copy_send_now')}
              </Button>
              <p className="text-muted-foreground text-xs leading-6">
                {responseCopyEmail
                  ? t('runtime.response_copy_once_only')
                  : t('runtime.response_copy_login_required_hint')}
              </p>
            </div>
          </div>
          <p className="mt-4 text-muted-foreground text-xs leading-6">
            {t('runtime.response_copy_support_note', {
              email: SUPPORT_EMAIL,
            })}
          </p>
        </div>
      )}
      {missingQuestionIssues.length > 0 ? (
        <div className="rounded-2xl border border-dynamic-orange/20 bg-background/55 px-5 py-4">
          <p className="font-medium text-dynamic-orange text-sm">
            {t('runtime.some_answers_need_review')}
          </p>
          <div className="mt-3 space-y-2">
            {missingQuestionIssues.map((issue, index) => (
              <div
                key={`${issue.questionTitle}-${index}`}
                className="rounded-xl border border-border/50 bg-background/70 px-3 py-2"
              >
                <p className="font-medium text-sm">{issue.questionTitle}</p>
                <p className="mt-1 text-muted-foreground text-sm">
                  {t('runtime.unmatched_answer_hint', {
                    value: issue.originalAnswer,
                  })}
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  ) : null;
}
