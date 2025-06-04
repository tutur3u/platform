import { createClient } from '@tuturuuu/supabase/next/server';
import { Database } from '@tuturuuu/types/supabase';

export type CertificateWithDetails =
  Database['public']['Tables']['course_certificates']['Row'] & {
    workspace_courses: Pick<
      Database['public']['Tables']['workspace_courses']['Row'],
      'name' | 'ws_id'
    > & {
      workspaces: Pick<
        Database['public']['Tables']['workspaces']['Row'],
        'name'
      >;
    };
    users: {
      user_private_details: Pick<
        Database['public']['Tables']['user_private_details']['Row'],
        'full_name'
      >;
    };
  };

export type CertificateDetails = {
  courseName: string;
  studentName: string;
  courseLecturer: string;
  completionDate: string;
  certificateId: string;
};

export async function getCertificateDetails(
  certificateId: string,
  userId: string
) {
  const supabase = await createClient();

  const { data: certificate, error } = (await supabase
    .from('course_certificates')
    .select(
      `
      id,
      completed_date,
      user_id,
      workspace_courses!course_certificates_course_id_fkey (
        name,
        ws_id,
        workspaces!workspace_courses_ws_id_fkey (
          name
        )
      ),
      users!course_certificates_user_id_fkey (
        user_private_details (
          full_name
        )
      )
    `
    )
    .eq('id', certificateId)
    .eq('user_id', userId)
    .single()) as { data: CertificateWithDetails | null; error: any };

  if (error) {
    throw new Error('Failed to fetch certificate');
  }

  if (!certificate) {
    throw new Error('Certificate not found');
  }

  return {
    courseName: certificate.workspace_courses.name,
    studentName: certificate.users.user_private_details.full_name,
    courseLecturer: certificate.workspace_courses.workspaces.name,
    completionDate: certificate.completed_date,
    certificateId: certificate.id,
  };
}
