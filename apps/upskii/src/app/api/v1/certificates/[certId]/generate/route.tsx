import { CertificateDocument } from './certificate-document';
import { CertificateData } from './types';
import { BASE_URL } from '@/constants/common';
import { renderToStream } from '@react-pdf/renderer';
import { getCurrentUser } from '@tuturuuu/utils/user-helper';
import { NextRequest } from 'next/server';

const getCertificateData = async (certID: string) => {
  const response = await fetch(`${BASE_URL}/api/v1/certificates/${certID}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch certificate data');
  }

  const userDetails = await getCurrentUser();
  const certDetails = await response.json();

  if (userDetails) {
    certDetails.studentName = userDetails.display_name;
  }

  return certDetails;
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ certId: string }> }
) {
  try {
    const {
      title,
      certifyText,
      completionText,
      offeredBy,
      completionDateLabel,
      certificateIdLabel,
    } = await req.json();
    const { certId } = await params;

    if (!certId) {
      return new Response('Certificate ID is required', { status: 400 });
    }

    const certData = await getCertificateData(certId);

    const data: CertificateData = {
      certData,
      title,
      certify_text: certifyText,
      completion_text: completionText,
      offered_by: offeredBy,
      completion_date: completionDateLabel,
      certificate_id: certificateIdLabel,
    };

    const stream = await renderToStream(<CertificateDocument data={data} />);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
    }
    const buffer = Buffer.concat(chunks);

    return new Response(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${certId}.pdf"`,
      },
    });
  } catch (error) {
    console.error('PDF generation failed:', error);
    return new Response('Error generating PDF', { status: 500 });
  }
}
