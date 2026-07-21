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
}: {
  form: FormDefinition;
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
}) {
  const submitMutation = usePublicFormSubmit(shareCode);
  const responseCopyMutation = usePublicFormResponseCopy(shareCode);

  return (
    <FormRuntime
      form={form}
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
        return submitMutation.mutateAsync({
          sessionId,
          answers,
          turnstileToken,
          sendResponseCopy: sendResponseCopy ?? false,
        });
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
