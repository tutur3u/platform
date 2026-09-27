'use client';

import type {
  TulearnBootstrapResponse,
  TulearnStudentSummary,
} from '@tuturuuu/internal-api';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';

export function LearnerStudentSelect({
  bootstrap,
  wsId,
}: {
  bootstrap: TulearnBootstrapResponse;
  wsId: string;
}) {
  const linkedStudents = bootstrap.linkedStudents.filter(
    (student) => student.workspace_id === wsId
  );
  const selectedStudentId = useSearchParams().get('studentId');
  const router = useRouter();
  const t = useTranslations();

  if (!linkedStudents.length) return null;

  return (
    <StudentSelect
      linkedStudents={linkedStudents}
      onChange={(studentId) =>
        router.push(studentId ? `/${wsId}?studentId=${studentId}` : `/${wsId}`)
      }
      profileName={bootstrap.profile.display_name ?? t('common.learner')}
      value={selectedStudentId ?? ''}
    />
  );
}

function StudentSelect({
  linkedStudents,
  onChange,
  profileName,
  value,
}: {
  linkedStudents: TulearnStudentSummary[];
  onChange: (value: string) => void;
  profileName: string;
  value: string;
}) {
  const t = useTranslations();

  return (
    <label className="min-w-0 flex-1">
      <span className="sr-only">{t('settings.linkedStudents')}</span>
      <select
        aria-label={t('settings.linkedStudents')}
        className="h-9 w-full min-w-0 rounded-md border border-border bg-background px-2 text-xs"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        <option value="">{profileName}</option>
        {linkedStudents.map((student) => (
          <option key={student.id} value={student.id}>
            {student.name ?? t('common.learner')}
          </option>
        ))}
      </select>
    </label>
  );
}
