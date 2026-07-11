'use client';

import { usePathname } from 'next/navigation';
import type { PropsWithChildren } from 'react';
import LessonVocabularySection from './vocabulary-section';

interface Props {
  lessonId: string;
  wsId: string;
}

export default function CourseLessonShell({
  children,
  lessonId,
  wsId,
}: PropsWithChildren<Props>) {
  const pathname = usePathname();
  const showInlineVocabulary = !pathname.endsWith('/vocabulary');

  return (
    <>
      {children}

      {showInlineVocabulary ? (
        <div className="mx-auto max-w-6xl px-4 pb-10 sm:px-6">
          <LessonVocabularySection wsId={wsId} moduleId={lessonId} />
        </div>
      ) : null}
    </>
  );
}
