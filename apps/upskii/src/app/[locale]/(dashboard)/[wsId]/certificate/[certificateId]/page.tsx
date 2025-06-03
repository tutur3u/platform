import Certificate from '../certificate-page';
import { DEV_MODE } from '@/constants/common';
import { getCurrentUser } from '@tuturuuu/utils/user-helper';

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
  const URL = DEV_MODE ? 'http://localhost:7806' : 'https://upskii.com';

  const { certificateId } = await params;

  // Available in the mock data: "CERT-2023-10-01-d3c4f4be-7b44-432b-8fe3-b8bcd3a3c2d5", "CERT-2024-03-15-a1b2c3d4-e5f6-4321-9876-123456789abc", "CERT-2024-04-20-98765432-abcd-efgh-ijkl-mnopqrstuvwx"

  const response = await fetch(`${URL}/api/v1/certificates/${certificateId}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch certificate');
  }

  const userDetails = await getCurrentUser();

  const certDetails = await response.json();

  // Replace the student name in the response with the user's name

  if (userDetails) {
    certDetails.studentName = userDetails.full_name;
  }

  return (
    <div>
      <Certificate certDetails={certDetails} />
    </div>
  );
}
