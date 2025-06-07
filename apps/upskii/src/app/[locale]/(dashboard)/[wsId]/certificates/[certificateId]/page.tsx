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
  wsId: string;
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

  try {
    const certDetails = await getCertificateDetails(
      certificateId,
      user.id,
      wsId
    );
    return (
      <>
        <Certificate certDetails={certDetails} wsId={wsId} />
      </>
    );
  } catch (error) {
    console.error('Error fetching certificate details:', error);
    notFound();
  }
}
