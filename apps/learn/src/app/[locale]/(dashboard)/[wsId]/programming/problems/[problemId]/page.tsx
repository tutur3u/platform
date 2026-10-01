import { ProgrammingProblemId } from '@tuturuuu/education-core/education/programming-schema';
import { InternalApiError } from '@tuturuuu/internal-api';
import {
  getProgrammingAuthorProblem,
  getProgrammingProblem,
  listProgrammingProblems,
} from '@tuturuuu/internal-api/education';
import { Button } from '@tuturuuu/ui/button';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { listReadyJudgeLanguages } from '@/lib/coding/store';
import {
  programmingApiOptions,
  programmingLearnerScope,
} from '@/lib/programming/server';
import { programmingFont } from '../../../coding/coding-font';
import { CodingProblem } from '../../../coding/coding-problem';
import { programmingPageFailure } from '../../page-feedback';
import { ProgrammingWorkspace } from '../../programming-workspace';

export default async function ProgrammingProblemPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; wsId: string; problemId: string }>;
  searchParams: Promise<{ studentId?: string; mode?: string }>;
}) {
  await connection();
  const [{ locale, wsId, problemId }, { studentId, mode }] = await Promise.all([
    params,
    searchParams,
  ]);
  if (!ProgrammingProblemId.safeParse(problemId).success) notFound();
  try {
    if (mode === 'author') {
      if (studentId)
        throw new InternalApiError(
          'Author requests cannot select a learner',
          400
        );
      const { problem } = await getProgrammingAuthorProblem(
        wsId,
        problemId,
        await programmingApiOptions()
      );
      const t = await getTranslations('programming');
      return (
        <section
          className={`flex min-h-0 flex-1 flex-col ${programmingFont.variable} [--font-mono:var(--font-programming-mono)]`}
        >
          <header className="flex shrink-0 items-center gap-3 border-b p-3">
            <span className="flex-1 text-muted-foreground text-sm">
              {t('authorPreview')}
            </span>
            {problem.editable && (
              <Button asChild variant="outline">
                <Link href={`/${wsId}/programming/problems/${problemId}/edit`}>
                  {t('edit')}
                </Link>
              </Button>
            )}
          </header>
          <CodingProblem
            challenge={{
              slug: problem.id,
              title: problem.title[locale === 'vi' ? 'vi' : 'en'],
              prompt: problem.prompt[locale === 'vi' ? 'vi' : 'en'],
              difficulty: problem.difficulty,
              topic: problem.topic,
              starterCode: problem.starterCode,
              samples: [],
              publicCases: problem.publicCases,
            }}
          />
        </section>
      );
    }
    if (mode && mode !== 'learner')
      return programmingPageFailure(
        new InternalApiError('Invalid mode', 400),
        locale,
        wsId
      );
    const { context, subject } = await programmingLearnerScope(wsId, studentId);
    const options = await programmingApiOptions();
    const [{ problem }, { problems }, availableLanguages] = await Promise.all([
      getProgrammingProblem(subject.wsId, problemId, studentId, options),
      listProgrammingProblems(
        subject.wsId,
        { mode: 'learner', studentId },
        options
      ),
      listReadyJudgeLanguages().catch(() => []),
    ]);
    return (
      <ProgrammingWorkspace
        problem={problem}
        catalog={problems}
        availableLanguages={availableLanguages}
        readOnly={subject.readOnly}
        studentId={studentId}
        scope={{
          actorId: context.user.id,
          wsId: subject.wsId,
          learnerId: subject.studentWorkspaceUserId,
          problemId,
        }}
      />
    );
  } catch (error) {
    return programmingPageFailure(error, locale, wsId);
  }
}
