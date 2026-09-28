import { connection } from 'next/server';
import { resolveCodingSubject } from '@/lib/coding/access';
import { listCodingChallenges } from '@/lib/coding/challenges';
import { listReadyJudgeLanguages } from '@/lib/coding/store';
import { CodingLab } from './coding-lab';

export default async function CodingPage({
  params,
  searchParams,
}: {
  params: Promise<{ wsId: string }>;
  searchParams: Promise<{ studentId?: string }>;
}) {
  await connection();
  const [{ wsId }, { studentId }] = await Promise.all([params, searchParams]);
  const subject = await resolveCodingSubject(wsId, studentId);
  const availableLanguages = await listReadyJudgeLanguages().catch(() => []);
  return (
    <CodingLab
      challenges={listCodingChallenges()}
      availableLanguages={availableLanguages}
      readOnly={subject.readOnly}
      studentId={studentId}
      wsId={wsId}
    />
  );
}
