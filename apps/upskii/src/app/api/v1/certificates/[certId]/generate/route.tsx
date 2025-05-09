import { DEV_MODE } from '@/constants/common';
import { getCurrentUser } from '@tuturuuu/utils/user-helper';
import { NextRequest } from 'next/server';
import { renderToStream } from '@react-pdf/renderer';
import { CertificateDocument } from './certificate-document';
import { CertificateData, Format } from './types';

const URL = DEV_MODE ? 'http://localhost:7806' : 'https://upskii.com';

const getCertificateData = async (certID: string) => {
  const response = await fetch(`${URL}/api/v1/certificates/${certID}`, {
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

    const format = req.nextUrl.searchParams.get('format') as Format;

    if (format !== 'pdf' && format !== 'png') {
      return new Response('Invalid format', { status: 400 });
    }

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