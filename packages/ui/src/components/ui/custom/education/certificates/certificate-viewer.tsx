'use client';

import { ImageIcon } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { DownloadButtonPDF } from '@tuturuuu/ui/custom/education/certificates/download-button-pdf';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect } from 'react';

const PDFViewer = dynamic(
  () =>
    import('@tuturuuu/ui/custom/education/modules/resources/pdf-viewer').then(
      (mod) => mod.PDFViewer
    ),
  { ssr: false }
);

interface CertificateViewerProps {
  certificateId: string;
  wsId: string;
  pdfDataUrl: string; // Pre-generated PDF data URL from server
}

export function CertificateViewer({
  certificateId,
  pdfDataUrl,
  wsId,
}: CertificateViewerProps) {
  const t = useTranslations('certificates');
  const pdfUrl = pdfDataUrl;

  useEffect(() => {
    // Cleanup blob URLs when component unmounts (but not data URLs)
    return () => {
      if (pdfDataUrl.startsWith('blob:')) {
        URL.revokeObjectURL(pdfDataUrl);
      }
    };
  }, [pdfDataUrl]);

  const handlePNG = useCallback(async () => {
    const element = document.getElementById('certificate-area');
    if (!element) {
      throw new Error('Certificate element not found');
    }

    try {
      const html2canvas = (await import('html2canvas-pro')).default;
      const canvas = await html2canvas(element, {
        useCORS: true,
        allowTaint: true,
        backgroundColor: null,
        scale: 2,
        logging: false,
        onclone: (clonedDoc: Document) => {
          Array.from(clonedDoc.getElementsByTagName('link')).forEach(
            (link: HTMLLinkElement) => {
              link.removeAttribute('integrity');
              link.removeAttribute('crossorigin');
            }
          );
        },
      });

      const link = document.createElement('a');
      link.download = `certificate-${certificateId}.png`;
      link.href = canvas.toDataURL('image/png', 2.0);
      link.click();
    } catch (error) {
      console.error('Error generating PNG:', error);
      throw error;
    }
  }, [certificateId]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4">
      <div id="certificate-area" className="w-full max-w-4xl">
        {pdfUrl && (
          <div className="rounded-lg border bg-white p-4">
            <PDFViewer url={pdfUrl} />
          </div>
        )}
      </div>
      <div id="download-buttons" className="mt-6 flex justify-center gap-2">
        <Button onClick={handlePNG}>
          <ImageIcon className="mr-1 h-4 w-4" />
          {t('download_button')} (PNG)
        </Button>
        <DownloadButtonPDF
          certificateId={certificateId}
          wsId={wsId}
          variant="default"
          pdfDataUrl={pdfDataUrl}
        />
      </div>
    </div>
  );
}
