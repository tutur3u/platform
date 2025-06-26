import { renderToStream } from '@react-pdf/renderer';
import { createClient } from '@tuturuuu/supabase/next/server';
import type { CertificateTemplate } from '@tuturuuu/types/db';
import type { CertificateData } from '@tuturuuu/ui/custom/education/certificates/types';
import type { NextRequest } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { getCertificateDetails } from '@/lib/certificate-helper';
import { ElegantCertificateDocument } from '../../templates/elegant-certificate';
import { ModernCertificateDocument } from '../../templates/modern-certificate';
import { OGCertificateDocument } from '../../templates/og-certificate';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ certId: string }> }
) {
  try {
    const { locale = 'en', wsId } = await req.json();
    const { certId } = await params;

    if (!certId || !wsId) {
      return new Response('Certificate ID and Workspace ID are required', {
        status: 400,
      });
    }

    const t = await getTranslations({ locale, namespace: 'certificates' });

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
      title: t('title'),
      certifyText: t('certify_text'),
      completionText: t('completion_text'),
      offeredBy: t('offered_by'),
      completionDateLabel: t('completion_date'),
      certificateIdLabel: t('certificate_id'),
    };

    const certTemplate: CertificateTemplate = certData.certTemplate;

    let stream: ReadableStream<Uint8Array> | null = null;

    switch (certTemplate) {
      case 'elegant':
        stream = await renderToStream(
          <ElegantCertificateDocument data={data} />
        );
        break;
      case 'modern':
        stream = await renderToStream(
          <ModernCertificateDocument data={data} />
        );
        break;
      case 'original':
        stream = await renderToStream(<OGCertificateDocument data={data} />);
        break;
      default:
        console.log('Unhandled template:', certTemplate);
        console.log('Using original template as fallback');
        stream = await renderToStream(<OGCertificateDocument data={data} />);
        break;
    }
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
