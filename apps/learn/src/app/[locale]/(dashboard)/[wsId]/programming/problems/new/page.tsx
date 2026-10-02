import { InternalApiError } from '@tuturuuu/internal-api';
import { connection } from 'next/server';
import { programmingAuthorScope } from '@/lib/programming/server';
import { programmingPageFailure } from '../../page-feedback';
import { ProgrammingProblemForm } from '../../problem-form';

export default async function NewProgrammingProblemPage({
  params,
}: {
  params: Promise<{ locale: string; wsId: string }>;
}) {
  await connection();
  const { locale, wsId } = await params;
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
    return <ProgrammingProblemForm wsId={access.normalizedWsId} />;
  } catch (error) {
    return programmingPageFailure(error, locale, wsId);
  }
}
