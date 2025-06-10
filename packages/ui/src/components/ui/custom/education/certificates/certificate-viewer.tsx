'use client';

import { Button } from '@tuturuuu/ui/button';
import { DownloadButtonPDF } from '@tuturuuu/ui/custom/education/certificates/download-button-pdf';
import { FileText, ImageIcon } from '@tuturuuu/ui/icons';
import html2canvas from 'html2canvas';
import { useTranslations } from 'next-intl';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useState } from 'react';

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
  className?: string;
  showDownloadButton?: boolean;
  locale?: string;
  pdfDataUrl?: string; // Pre-generated PDF data URL from server
}

export function CertificateViewer({
  certificateId,
  wsId,
  className = '',
  locale = 'en',
  pdfDataUrl,
}: CertificateViewerProps) {
  const t = useTranslations('certificates');
  const [pdfUrl, setPdfUrl] = useState<string | null>(pdfDataUrl || null);
  const [isLoading, setIsLoading] = useState(!pdfDataUrl);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // If we already have a pdfDataUrl from server, no need to generate
    if (pdfDataUrl) {
      setPdfUrl(pdfDataUrl);
      setIsLoading(false);
      return;
    }

    // Otherwise, generate PDF client-side (fallback)
    const generatePdfPreview = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const response = await fetch(
          `/api/v1/certificates/${certificateId}/generate`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              locale,
              wsId,
            }),
          }
        );

        if (!response.ok) {
          throw new Error(`Failed to generate PDF: ${response.statusText}`);
        }

        const pdfBlob = new Blob([await response.arrayBuffer()], {
          type: 'application/pdf',
        });

        const url = URL.createObjectURL(pdfBlob);
        setPdfUrl(url);
      } catch (error) {
        console.error('Error generating PDF preview:', error);
        setError(error instanceof Error ? error.message : 'Unknown error');
      } finally {
        setIsLoading(false);
      }
    };

    generatePdfPreview();
  }, [certificateId, wsId, locale, pdfDataUrl]);

  useEffect(() => {
    // Cleanup blob URLs when component unmounts (but not data URLs)
    return () => {
      if (pdfUrl && pdfUrl.startsWith('blob:')) {
        URL.revokeObjectURL(pdfUrl);
      }
    };
  }, [pdfUrl]);

  const handlePNG = useCallback(async () => {
    const element = document.getElementById('certificate-area');
    if (!element) {
      throw new Error('Certificate element not found');
    }

    try {
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
  if (isLoading) {
    return (
      <div
        className={`flex min-h-[400px] items-center justify-center ${className}`}
      >
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-blue-600"></div>
          <p className="text-sm text-gray-600">Generating certificate...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className={`flex min-h-[400px] items-center justify-center ${className}`}
      >
        <div className="flex flex-col items-center gap-4 text-center">
          <FileText className="h-12 w-12 text-gray-400" />
          <div>
            <h3 className="text-lg font-semibold text-gray-900">
              Error loading certificate
            </h3>
            <p className="text-sm text-gray-600">{error}</p>
          </div>
        </div>
      </div>
    );
  }

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
