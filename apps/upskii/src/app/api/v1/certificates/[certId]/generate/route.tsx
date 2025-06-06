import { getCertificateDetails } from '@/lib/certificate-helper';
import { renderToStream } from '@react-pdf/renderer';
import { createClient } from '@tuturuuu/supabase/next/server';
import { getTranslations } from 'next-intl/server';
import { NextRequest } from 'next/server';
import { CertificateDocument } from './certificate-document';
import { CertificateData } from './types';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ certId: string }> }
) {
  try {
    const {
      locale = 'en',
      wsId,
    } = await req.json();
    const { certId } = await params;

    if (!certId || !wsId) {
      return new Response('Certificate ID and Workspace ID are required', {
        status: 400,
      });
    }

    const t = await getTranslations({locale, namespace: 'certificates'});

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
      title : t('title'),
      certifyText: t('certify_text'),
      completionText: t('completion_text'),
      offeredBy: t('offered_by'),
      completionDateLabel: t('completion_date'),
      certificateIdLabel: t('certificate_id'),
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
