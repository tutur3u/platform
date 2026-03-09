'use client';

import { FormRuntime } from '@/features/forms/form-runtime';
import {
  usePublicFormProgress,
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
}: {
  form: FormDefinition;
  shareCode: string;
  sessionId?: string;
  readOnly?: boolean;
  initialAnswers?: Record<string, FormAnswerValue>;
  answerIssues?: FormReadOnlyAnswerIssue[];
  submittedAt?: string | null;
}) {
  const progressMutation = usePublicFormProgress(shareCode);
  const submitMutation = usePublicFormSubmit(shareCode);

  return (
    <FormRuntime
      form={form}
      mode="public"
      sessionId={sessionId}
      readOnly={readOnly}
      initialAnswers={initialAnswers}
      answerIssues={answerIssues}
      submittedAt={submittedAt}
      onProgress={(payload) => progressMutation.mutate(payload)}
      onSubmit={async ({ answers, turnstileToken }) => {
        if (!sessionId) return;
        await submitMutation.mutateAsync({
          sessionId,
          answers,
          turnstileToken,
        });
      }}
      isSubmitting={submitMutation.isPending}
    />
  );
}
