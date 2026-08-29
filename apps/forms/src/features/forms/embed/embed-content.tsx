'use client';

import { useState } from 'react';
import SharedFormContent from '@/app/[locale]/f/[shareCode]/content';
import type { SharedFormPayload } from '@/features/forms/shared-form-data';
import { EmbedFrame } from './embed-frame';

/**
 * The embedded form.
 *
 * Reuses the public form component verbatim rather than a stripped-down copy:
 * an embedded form must behave identically to the hosted one — same branching,
 * same validation, same Turnstile, same submission endpoint — and a parallel
 * implementation would inevitably fall behind.
 */
export function EmbedContent({
  data,
  shareCode,
}: {
  data: SharedFormPayload;
  shareCode: string;
}) {
  const [submitted, setSubmitted] = useState(Boolean(data.submittedAt));

  return (
    <EmbedFrame shareCode={shareCode} submitted={submitted}>
      <SharedFormContent
        answerIssues={data.answerIssues}
        canRequestResponseCopy={data.canRequestResponseCopy}
        form={data.form}
        layout="inline"
        initialAnswers={data.initialAnswers}
        onSubmitted={() => setSubmitted(true)}
        readOnly={data.readOnly}
        readOnlyResponseId={data.readOnlyResponseId}
        readOnlyResponseSessionId={data.readOnlyResponseSessionId}
        responseCopyAlreadySent={data.responseCopyAlreadySent}
        responseCopyEmail={data.responseCopyEmail}
        sessionId={data.sessionId}
        shareCode={shareCode}
        submittedAt={data.submittedAt}
      />
    </EmbedFrame>
  );
}
