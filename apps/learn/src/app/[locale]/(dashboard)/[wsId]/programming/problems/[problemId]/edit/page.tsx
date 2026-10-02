import { ProgrammingProblemId } from '@tuturuuu/education-core/education/programming-schema';
import { InternalApiError } from '@tuturuuu/internal-api';
import { getProgrammingAuthorProblem } from '@tuturuuu/internal-api/programming';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { getTranslations } from 'next-intl/server';
import {
  programmingApiOptions,
  programmingAuthorScope,
} from '@/lib/programming/server';
import { programmingPageFailure } from '../../../page-feedback';
import { ProgrammingProblemForm } from '../../../problem-form';

export default async function EditProgrammingProblemPage({
  params,
}: {
  params: Promise<{ locale: string; wsId: string; problemId: string }>;
}) {
  await connection();
  const { locale, wsId, problemId } = await params;
  if (!ProgrammingProblemId.safeParse(problemId).success) notFound();
  try {
    const { access } = await programmingAuthorScope(wsId);
    if (!access.ok)
      return programmingPageFailure(
        new InternalApiError(
          'Author access unavailable',
          access.response.status
        ),
        locale,
        wsId
      );
    const { problem } = await getProgrammingAuthorProblem(
      access.normalizedWsId,
      problemId,
      await programmingApiOptions()
    );
    if (!problem.editable) {
      const t = await getTranslations('programming');
      return (
        <p role="alert" className="p-6">
          {t('editGlobalDenied')}
        </p>
      );
    }
    return (
      <ProgrammingProblemForm
        key={`${problem.id}:${problem.revision}`}
        wsId={access.normalizedWsId}
        problem={problem}
      />
    );
  } catch (error) {
    return programmingPageFailure(error, locale, wsId);
  }
}
