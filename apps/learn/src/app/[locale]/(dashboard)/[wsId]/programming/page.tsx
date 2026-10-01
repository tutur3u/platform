import { InternalApiError } from '@tuturuuu/internal-api';
import { listProgrammingProblems } from '@tuturuuu/internal-api/education';
import { connection } from 'next/server';
import {
  programmingApiOptions,
  programmingAuthorScope,
  programmingStudentId,
} from '@/lib/programming/server';
import { ProgrammingCatalog } from './catalog';
import { programmingPageFailure } from './page-feedback';

export default async function ProgrammingCatalogPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; wsId: string }>;
  searchParams: Promise<{ mode?: string; studentId?: string; cursor?: string }>;
}) {
  await connection();
  const [{ locale, wsId }, search] = await Promise.all([params, searchParams]);
  try {
    if (search.mode && search.mode !== 'learner' && search.mode !== 'author')
      throw new InternalApiError('Invalid catalog mode', 400);
    const studentId = programmingStudentId(search.studentId);
    const options = await programmingApiOptions();
    let mode =
      search.mode === 'author' ? ('author' as const) : ('learner' as const);
    let result: Awaited<ReturnType<typeof listProgrammingProblems>>;
    try {
      result = await listProgrammingProblems(
        wsId,
        { mode, studentId, cursor: search.cursor },
        options
      );
    } catch (error) {
      // A manager without a linked learner can enter the separately authorized author catalog.
      if (
        !(error instanceof InternalApiError) ||
        error.status !== 403 ||
        studentId ||
        search.mode
      )
        throw error;
      mode = 'author';
      result = await listProgrammingProblems(
        wsId,
        { mode, cursor: search.cursor },
        options
      );
    }
    const author = mode === 'author';
    const authorAccess = author
      ? null
      : (await programmingAuthorScope(wsId)).access;
    if (
      authorAccess &&
      !authorAccess.ok &&
      authorAccess.response.status !== 403
    )
      throw new InternalApiError(
        'Failed to verify author access',
        authorAccess.response.status
      );
    const canAuthor = author || authorAccess?.ok === true;
    return (
      <ProgrammingCatalog
        wsId={wsId}
        locale={locale}
        author={author}
        canAuthor={canAuthor}
        studentId={studentId}
        problems={result.problems}
        nextCursor={result.nextCursor}
      />
    );
  } catch (error) {
    return programmingPageFailure(error, locale, wsId);
  }
}
