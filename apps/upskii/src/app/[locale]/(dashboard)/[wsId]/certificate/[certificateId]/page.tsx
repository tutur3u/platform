import Certificate from '../certificate-page';
import { getCertificateDetails } from '@/lib/certificate-helper';
import { createClient } from '@tuturuuu/supabase/next/server';
import { notFound, redirect } from 'next/navigation';

export type CertificateProps = {
  certDetails: {
    courseName: string;
    studentName: string | null;
    courseLecturer: string | null;
    completionDate: string;
    certificateId: string;
  };
};

interface PageProps {
  params: Promise<{
    certificateId: string;
    wsId: string;
  }>;
}

export default async function CertificatePage({ params }: PageProps) {
  const { certificateId, wsId } = await params;
  const supabase = await createClient();

  // Get current user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.id) {
    redirect('/'); // Redirect to home if not authenticated
  }

  // Check if the certificate belongs to the workspace
  const { data: certificate, error } = await supabase
    .from('course_certificates')
    .select('workspace_courses!course_certificates_course_id_fkey(ws_id)')
    .eq('id', certificateId)
    .single();

  if (error) {
    console.error('Error fetching certificate:', error);
    redirect('/');
  }

  if (certificate?.workspace_courses?.ws_id !== wsId) {
    notFound();
  }

  try {
    // This will throw an error if the user is not the owner
    const certDetails = await getCertificateDetails(certificateId, user.id);
    return (
      <div>
        <Certificate certDetails={certDetails} />
      </div>
    );
  } catch (error) {
    // If there's any error (including unauthorized access), redirect to home
    redirect('/');
  }
}
