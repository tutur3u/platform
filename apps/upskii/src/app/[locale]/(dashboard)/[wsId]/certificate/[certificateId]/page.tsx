import { getCertificateDetails } from '@/lib/certificate-helper';
import { createClient } from '@tuturuuu/supabase/next/server';
import { redirect } from 'next/navigation';
import Certificate from '../certificate-page';

export type CertificateProps = {
  certDetails: {
    courseName: string;
    studentName: string;
    courseLecturer: string;
    completionDate: string;
    certificateId: string;
  };
};

interface PageProps {
  params: Promise<{
    certificateId: string;
  }>;
}

export default async function CertificatePage({ params }: PageProps) {
  const { certificateId } = await params;
  const supabase = await createClient();

  // Get current user
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.id) {
    redirect('/'); // Redirect to home if not authenticated
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
