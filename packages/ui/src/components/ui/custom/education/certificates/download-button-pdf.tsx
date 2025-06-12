'use client';

import { Button } from '@tuturuuu/ui/button';
import { FileText } from '@tuturuuu/ui/icons';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback } from 'react';

export function DownloadButtonPDF({
  certificateId,
  wsId,
  className = '',
  variant = 'outline',
  pdfDataUrl,
}: {
  certificateId: string;
  wsId: string;
  className?: string;
  variant?: 'default' | 'outline' | 'ghost' | 'link' | 'destructive';
  pdfDataUrl?: string;
}) {
  const t = useTranslations('certificates');
  const locale = useLocale();

  const handleDownload = useCallback(async () => {
    try {
      if (pdfDataUrl) {
        // Use the data URL directly for download
        const link = document.createElement('a');
        link.href = pdfDataUrl;
        link.download = `${certificateId}.pdf`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        return;
      }

      const res = await fetch(
        `/api/v1/certificates/${certificateId}/generate`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            locale: locale,
            wsId: wsId,
          }),
        }
      );

      if (!res.ok) {
        throw new Error(`Server error: ${res.status} ${res.statusText}`);
      }

      const pdfBlob = new Blob([await res.arrayBuffer()], {
        type: 'application/pdf',
      });

      const url = window.URL.createObjectURL(pdfBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${certificateId}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url); // Clean up the URL object
    } catch (error) {
      console.error('Error downloading PDF:', error);
    }
  }, [certificateId, wsId, pdfDataUrl, locale]);

  return (
    <Button
      onClick={handleDownload}
      className={`${className}`}
      variant={variant}
    >
      <FileText className="mr-1 h-3 w-3" />
      {t('download_button')} (PDF)
    </Button>
  );
}
