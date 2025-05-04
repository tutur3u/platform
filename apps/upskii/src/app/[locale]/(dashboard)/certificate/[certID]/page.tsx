import Certificate from '../getCert';

export type CertificateProps = {
  certDetails: {
    courseName: string;
    studentName: string;
    courseLecturer: string;
    completionDate: string;
    certificateId: string;
  };
};

export default async function CertificatePage({
  params,
}: {
  params: { certID: string };
}) {
  const certID = params.certID;

  const response = await fetch(
    `http://localhost:7806/api/v1/certificates/${certID}`,
    {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );

  if (!response.ok) {
    throw new Error('Failed to fetch certificate');
  }

  const certDetails = await response.json();

  return (
    <div>
      <Certificate certDetails={certDetails} />
    </div>
  );
}
