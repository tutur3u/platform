// File: app/(dashboard)/[wsId]/quiz-sets/[setId]/take/sections/before-take-quiz-section.tsx
'use client';

import { Button } from '@tuturuuu/ui/button';
import Link from 'next/link';
import React from 'react';

// File: app/(dashboard)/[wsId]/quiz-sets/[setId]/take/sections/before-take-quiz-section.tsx

interface BeforeTakeQuizSectionProps {
  t: (key: string, options?: Record<string, any>) => string;
  quizMeta: {
    setName: string;
    attemptsSoFar: number;
    attemptLimit: number | null;
    timeLimitMinutes: number | null;
  };
  dueDateStr?: string | null;
  instruction?: string | null;
  onClickStart: () => void;
  /**
   * If provided, render a link to view past attempts.
   * e.g. `/dashboard/[wsId]/…/results`
   */
  viewResultsUrl?: string;
}

export default function BeforeTakeQuizSection({
  t,
  quizMeta,
  dueDateStr,
  instruction,
  onClickStart,
  viewResultsUrl,
}: BeforeTakeQuizSectionProps) {
  return (
    <div className="mx-auto max-w-lg space-y-6 p-6">
      {/* Due date */}
      {dueDateStr && (
        <p className="text-center text-base text-gray-600">
          {t('ws-quizzes.due_on') || 'Due on'}:{' '}
          {new Date(dueDateStr).toLocaleString()}
        </p>
      )}

      {/* Instruction (Markdown or simple text) */}
      {instruction && (
        <div className="prose mb-4 rounded-lg border p-4">
          {/* If your instruction is raw HTML, use dangerouslySetInnerHTML */}
          <div>{instruction}</div>
        </div>
      )}

      {/* Title & stats */}
      <h1 className="text-center text-3xl font-bold">{quizMeta.setName}</h1>
      <p className="text-center text-lg">
        {t('ws-quizzes.attempts') || 'Attempts'}: {quizMeta.attemptsSoFar} /{' '}
        {quizMeta.attemptLimit ?? (t('ws-quizzes.unlimited') || 'Unlimited')}
      </p>
      <p className="text-center text-base text-gray-700">
        {quizMeta.timeLimitMinutes != null
          ? `${t('ws-quizzes.time_limit') || 'Time Limit'}: ${
              quizMeta.timeLimitMinutes
            } ${t('ws-quizzes.minutes') || 'minutes'}`
          : t('ws-quizzes.no_time_limit') || 'No time limit'}
      </p>

      {/* Primary action */}
      <div className="flex justify-center">
        <Button
          className="border border-dynamic-purple bg-dynamic-purple/20 text-white hover:bg-dynamic-purple/40"
          onClick={onClickStart}
        >
          {t('ws-quizzes.take_quiz') || 'Take Quiz'}
        </Button>
      </div>

      {/* Optional: view past attempts */}
      {viewResultsUrl && (
        <div className="text-center">
          <Link href={viewResultsUrl} passHref>
            <a className="text-sm text-dynamic-purple underline hover:text-dynamic-purple/80">
              {t('ws-quizzes.view_previous_attempts') ||
                'View Previous Attempts'}
            </a>
          </Link>
        </div>
      )}
    </div>
  );
}
