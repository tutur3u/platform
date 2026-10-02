'use client';
import type {
  ProgrammingProblem,
  ProgrammingProblemSummary,
} from '@tuturuuu/types/primitives/programming';
import { useLocale } from 'next-intl';
import { useMemo } from 'react';
import { useRouter } from '@/i18n/navigation';
import type { CodingLanguage } from '@/lib/coding/languages';
import type { ProgrammingDraftScope } from '@/lib/programming/drafts';
import { type CodingAttempt, CodingLab } from '../coding/coding-lab';
import {
  getProgrammingSubmission,
  listProgrammingExecutions,
  submitProgrammingSolution,
} from './actions';

export function ProgrammingWorkspace({
  problem,
  catalog,
  scope,
  readOnly,
  studentId,
  availableLanguages,
}: {
  problem: ProgrammingProblem;
  catalog: ProgrammingProblemSummary[];
  scope: ProgrammingDraftScope;
  readOnly: boolean;
  studentId?: string;
  availableLanguages: CodingLanguage[];
}) {
  const locale = useLocale() === 'vi' ? 'vi' : 'en';
  const router = useRouter();
  const challenges = useMemo(
    () =>
      (catalog.some((entry) => entry.id === problem.id)
        ? catalog
        : [problem, ...catalog]
      ).map((entry) => ({
        slug: entry.id,
        difficulty: entry.difficulty,
        topic: entry.topic,
        title: entry.title[locale],
        prompt: entry.id === problem.id ? problem.prompt[locale] : '',
        starterCode: entry.id === problem.id ? problem.starterCode : '',
        samples: [],
        publicCases: entry.id === problem.id ? problem.publicCases : [],
      })),
    [catalog, locale, problem]
  );
  const api = useMemo(
    () => ({
      submit: (attempt: CodingAttempt) =>
        submitProgrammingSolution(
          scope.wsId,
          studentId,
          problem.id,
          attempt.language,
          attempt.source,
          attempt.kind,
          attempt.customCase
        ),
      get: (id: string) =>
        getProgrammingSubmission(scope.wsId, studentId, problem.id, id),
      list: (_id: string, before?: string) =>
        listProgrammingExecutions(scope.wsId, studentId, problem.id, before),
    }),
    [scope.wsId, studentId, problem.id]
  );
  return (
    <CodingLab
      key={JSON.stringify(scope)}
      availableLanguages={availableLanguages}
      challenges={challenges}
      initialSelected={problem.id}
      draftScope={scope}
      api={api}
      onNavigate={(id) => {
        if (!catalog.some((entry) => entry.id === id)) return;
        router.push(
          `/${scope.wsId}/programming/problems/${id}${studentId ? `?studentId=${encodeURIComponent(studentId)}` : ''}`
        );
      }}
      readOnly={readOnly}
      studentId={studentId}
      wsId={scope.wsId}
    />
  );
}
