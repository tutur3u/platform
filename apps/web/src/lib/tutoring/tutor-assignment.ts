import {
  readTutoringPolicyConfigRows,
  TUTORING_POLICY_CONFIG_ID,
} from '@tuturuuu/internal-api/tutoring-policy';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { NextResponse } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { listWorkspaceTutorIds } from './teachers';

export async function validateTutorAssignment({
  normalizedWsId,
  sbAdmin,
  teacherIds,
}: {
  normalizedWsId: string;
  sbAdmin: TypedSupabaseClient;
  teacherIds: string[];
}) {
  const t = await getTranslations('ws-tutoring');
  const { data, error } = await sbAdmin
    .from('workspace_configs')
    .select('id,value')
    .eq('ws_id', normalizedWsId)
    .like('id', `${TUTORING_POLICY_CONFIG_ID}%`);
  if (error)
    return NextResponse.json(
      { message: t('teacher_validation_failed') },
      { status: 500 }
    );
  const { tutorGroupIds } = readTutoringPolicyConfigRows(data ?? []);
  if (!tutorGroupIds.length) return null;
  const tutors = await listWorkspaceTutorIds({
    normalizedWsId,
    sbAdmin,
    tutorGroupIds,
  });
  if (tutors.error)
    return NextResponse.json(
      { message: t('teacher_validation_failed') },
      { status: 500 }
    );
  if (teacherIds.some((id) => !tutors.tutorIds.includes(id)))
    return NextResponse.json(
      { message: t('teacher_must_be_tutor') },
      { status: 400 }
    );
  return null;
}
