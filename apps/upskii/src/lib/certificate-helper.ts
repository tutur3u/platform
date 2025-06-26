import { createClient } from '@tuturuuu/supabase/next/server';
import type {
  CourseCertificate,
  UserPrivateDetails,
  Workspace,
  WorkspaceCourse,
} from '@tuturuuu/types/db';

export type CertificateWithDetails = CourseCertificate & {
  workspace_courses: Pick<
    WorkspaceCourse,
    'name' | 'ws_id' | 'cert_template'
  > & {
    workspaces: Pick<Workspace, 'name'>;
  };
  users: {
    user_private_details: Pick<UserPrivateDetails, 'full_name'>;
  };
};

export type CertificateListItem = {
  id: string;
  courseName: string;
  completionDate: string;
  workspaceName: string;
  wsId: string;
};

export async function getCertificateDetails(
  certificateId: string,
  userId: string,
  ws_id: string
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
        cert_template,
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
    .eq('workspace_courses.ws_id', ws_id)
    .single()) as { data: CertificateWithDetails | null; error: unknown };

  if (error) {
    console.log(error);
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
    certTemplate: certificate.workspace_courses.cert_template,
  };
}

export async function getAllCertificatesForUser(
  userId: string,
  wsId: string,
  options?: {
    page?: number;
    pageSize?: number;
  }
): Promise<{ certificates: CertificateListItem[]; totalCount: number }> {
  const supabase = await createClient();

  let queryBuilder = supabase
    .from('course_certificates')
    .select(
      `
      id,
      completed_date,
      workspace_courses!inner (
        name,
        ws_id,
        workspaces!inner (
          name
        )
      )
    `,
      { count: 'exact' }
    )
    .eq('user_id', userId)
    .eq('workspace_courses.ws_id', wsId)
    .order('completed_date', { ascending: false });

  // Apply pagination if provided
  if (options?.page && options?.pageSize) {
    const start = (options.page - 1) * options.pageSize;
    const end = start + options.pageSize - 1;
    queryBuilder = queryBuilder.range(start, end);
  }

  const {
    data: certificates,
    error,
    count,
  } = (await queryBuilder) as {
    data:
      | (CourseCertificate & {
          workspace_courses: Pick<WorkspaceCourse, 'name' | 'ws_id'> & {
            workspaces: Pick<Workspace, 'name'>;
          };
        })[]
      | null;
    error: unknown;
    count: number | null;
  };

  if (error) {
    throw new Error('Failed to fetch certificates');
  }

  if (!certificates) {
    return { certificates: [], totalCount: 0 };
  }

  const certificateList = certificates.map((certificate) => ({
    id: certificate.id,
    courseName: certificate.workspace_courses?.name || 'Unknown Course',
    completionDate: certificate.completed_date,
    workspaceName:
      certificate.workspace_courses?.workspaces?.name || 'Unknown Workspace',
    wsId: certificate.workspace_courses?.ws_id || '',
  }));

  return {
    certificates: certificateList,
    totalCount: count || 0,
  };
}
