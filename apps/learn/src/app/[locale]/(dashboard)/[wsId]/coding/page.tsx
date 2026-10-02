import { listProgrammingProblems } from '@tuturuuu/internal-api/programming';
import { connection } from 'next/server';
import { redirect } from '@/i18n/navigation';
import {
  programmingApiOptions,
  programmingStudentId,
} from '@/lib/programming/server';
import { programmingPageFailure } from '../programming/page-feedback';

export default async function LegacyCodingPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; wsId: string }>;
  searchParams: Promise<{ studentId?: string }>;
}) {
  await connection();
  const [{ locale, wsId }, search] = await Promise.all([params, searchParams]);
  let destination: string;
  try {
    const studentId = programmingStudentId(search.studentId);
    const { problems } = await listProgrammingProblems(
      wsId,
      { mode: 'learner', studentId },
      await programmingApiOptions()
    );
    destination = `/${wsId}/programming${problems[0] ? `/problems/${problems[0].id}` : ''}${studentId ? `?studentId=${encodeURIComponent(studentId)}` : ''}`;
  } catch (error) {
    return programmingPageFailure(error, locale, wsId);
  }
  return redirect({ locale, href: destination });
}
