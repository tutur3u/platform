'use client';

import { FormRuntime } from '@/features/forms/form-runtime';
import {
  usePublicFormResponseCopy,
  usePublicFormSubmit,
} from '@/features/forms/hooks';
import type {
  FormAnswerValue,
  FormDefinition,
  FormReadOnlyAnswerIssue,
} from '@/features/forms/types';

export default function SharedFormContent({
  form,
  shareCode,
  sessionId,
  readOnly,
  initialAnswers,
  answerIssues,
  submittedAt,
  responseCopyEmail,
  readOnlyResponseId,
  readOnlyResponseSessionId,
  canRequestResponseCopy,
  responseCopyAlreadySent,
  onSubmitted,
  layout = 'page',
}: {
  form: FormDefinition;
  /** `inline` when this is embedded rather than the whole page. */
  layout?: 'page' | 'inline';
  shareCode: string;
  sessionId?: string;
  readOnly?: boolean;
  initialAnswers?: Record<string, FormAnswerValue>;
  answerIssues?: FormReadOnlyAnswerIssue[];
  submittedAt?: string | null;
  responseCopyEmail?: string | null;
  readOnlyResponseId?: string | null;
  readOnlyResponseSessionId?: string | null;
  canRequestResponseCopy?: boolean;
  responseCopyAlreadySent?: boolean;
  /** Fired after a successful submission; used by the embed to notify the host. */
  onSubmitted?: () => void;
}) {
  const submitMutation = usePublicFormSubmit(shareCode);
  const responseCopyMutation = usePublicFormResponseCopy(shareCode);

  return (
    <FormRuntime
      form={form}
      layout={layout}
      mode="public"
      readOnly={readOnly}
      initialAnswers={initialAnswers}
      answerIssues={answerIssues}
      submittedAt={submittedAt}
      responseCopyEmail={responseCopyEmail}
      readOnlyResponseId={readOnlyResponseId}
      readOnlyResponseSessionId={readOnlyResponseSessionId}
      canRequestResponseCopy={canRequestResponseCopy}
      responseCopyAlreadySent={responseCopyAlreadySent}
      onSubmit={async ({ answers, turnstileToken, sendResponseCopy }) => {
        if (!sessionId) return;
        const result = await submitMutation.mutateAsync({
          sessionId,
          answers,
          turnstileToken,
          sendResponseCopy: sendResponseCopy ?? false,
        });
        onSubmitted?.();
        return result;
      }}
      onRequestResponseCopy={({
        responseId,
        sessionId: existingSessionId,
        turnstileToken,
      }) =>
        responseCopyMutation.mutateAsync({
          responseId,
          sessionId: existingSessionId,
          turnstileToken,
        })
      }
      isSubmitting={submitMutation.isPending}
    />
  );
}
