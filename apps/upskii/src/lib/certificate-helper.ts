import { createClient } from '@tuturuuu/supabase/next/server';
import { Database } from '@tuturuuu/types/supabase';

// Types for the database response
type CertificateWithDetails = Database['public']['Tables']['course_certificates']['Row'] & {
  workspace_courses: Pick<Database['public']['Tables']['workspace_courses']['Row'], 'name' | 'ws_id'> & {
    workspaces: Pick<Database['public']['Tables']['workspaces']['Row'], 'name'>;
  };
  users: {
    user_private_details: Pick<Database['public']['Tables']['user_private_details']['Row'], 'full_name'>;
  };
};

// Type for the formatted certificate data
export type CertificateDetails = {
  courseName: string;
  studentName: string;
  courseLecturer: string;
  completionDate: string;
  certificateId: string;
};

// Custom error class for certificate-related errors
export class CertificateError extends Error {
  constructor(message: string, public statusCode: number = 404) {
    super(message);
    this.name = 'CertificateError';
  }
}

/**
 * Fetches and formats certificate details for a given certificate ID and user
 * @throws {CertificateError} If the certificate cannot be found or user is unauthorized
 */
export async function getCertificateDetails(certificateId: string, userId: string): Promise<CertificateDetails> {
  const supabase = await createClient();

  const { data: certificate, error } = await supabase
    .from('course_certificates')
    .select(`
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
    `)
    .eq('id', certificateId)
    .eq('user_id', userId)
    .single();

  if (error) {
    throw new CertificateError('Failed to fetch certificate', 500);
  }

  if (!certificate) {
    throw new CertificateError('Certificate not found');
  }

  return {
    courseName: certificate.workspace_courses.name,
    studentName: certificate.users.user_private_details.full_name,
    courseLecturer: certificate.workspace_courses.workspaces.name,
    completionDate: certificate.completed_date,
    certificateId: certificate.id,
  };
} 