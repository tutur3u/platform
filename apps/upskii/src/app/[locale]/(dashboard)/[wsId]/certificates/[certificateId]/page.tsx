import { CertificateData } from '@/app/api/v1/certificates/[certId]/generate/types';
import { ElegantCertificateDocument } from '@/app/api/v1/certificates/templates/elegant-certificate';
import { ModernCertificateDocument } from '@/app/api/v1/certificates/templates/modern-certificate';
import { OGCertificateDocument } from '@/app/api/v1/certificates/templates/og-certificate';
import { getCertificateDetails } from '@/lib/certificate-helper';
import { renderToBuffer } from '@react-pdf/renderer';
import { createClient } from '@tuturuuu/supabase/next/server';
import { Database } from '@tuturuuu/types/supabase';
import { CertificateViewer } from '@tuturuuu/ui/custom/education/certificates/certificate-viewer';
import { getLocale, getTranslations } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';

export type CertificateProps = {
  certDetails: {
    courseName: string;
    studentName: string | null;
    courseLecturer: string | null;
    completionDate: string;
    certificateId: string;
    certTemplate: string;
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
  const locale = await getLocale();

  // Get current user
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.id) {
    redirect('/'); // Redirect to home if not authenticated
  }

  try {
    // Validate that the user has access to this certificate and get details
    const certDetails = await getCertificateDetails(
      certificateId,
      user.id,
      wsId
    );

    // Get translations for PDF generation
    const t = await getTranslations({ locale, namespace: 'certificates' });

    // Prepare certificate data
    const data: CertificateData = {
      certData: certDetails,
      title: t('title'),
      certifyText: t('certify_text'),
      completionText: t('completion_text'),
      offeredBy: t('offered_by'),
      completionDateLabel: t('completion_date'),
      certificateIdLabel: t('certificate_id'),
    };

    const certTemplate: Database['public']['Enums']['certificate_templates'] =
      certDetails.certTemplate;
    let pdfBuffer: Buffer;
    switch (certTemplate) {
      case 'elegant':
        pdfBuffer = await renderToBuffer(
          <ElegantCertificateDocument data={data} />
        );
        break;
      case 'modern':
        pdfBuffer = await renderToBuffer(
          <ModernCertificateDocument data={data} />
        );
        break;
      default:
        pdfBuffer = await renderToBuffer(<OGCertificateDocument data={data} />);
        break;
    }

    // Convert buffer to base64 data URL
    const pdfDataUrl = `data:application/pdf;base64,${pdfBuffer.toString('base64')}`;

    return (
      <CertificateViewer
        certificateId={certificateId}
        wsId={wsId}
        locale={locale}
        showDownloadButton={true}
        pdfDataUrl={pdfDataUrl}
      />
    );
  } catch (error) {
    console.error('Error generating certificate:', error);
    notFound();
  }
}
