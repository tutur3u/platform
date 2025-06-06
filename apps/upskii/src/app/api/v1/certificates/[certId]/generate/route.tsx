import { CertificateDocument } from './certificate-document';
import { CertificateData } from './types';
import { getCertificateDetails } from '@/lib/certificate-helper';
import { renderToStream } from '@react-pdf/renderer';
import { createClient } from '@tuturuuu/supabase/next/server';
import { NextRequest } from 'next/server';

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
      wsId,
    } = await req.json();
    const { certId } = await params;

    if (!certId) {
      return new Response('Certificate ID is required', { status: 400 });
    }

    // Get the authenticated user
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.id) {
      return new Response('Unauthorized', { status: 401 });
    }

    // Get certificate data directly using our helper
    const certData = await getCertificateDetails(certId, user.id, wsId);

    const data: CertificateData = {
      certData,
      title,
      certifyText,
      completionText,
      offeredBy,
      completionDateLabel,
      certificateIdLabel,
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
