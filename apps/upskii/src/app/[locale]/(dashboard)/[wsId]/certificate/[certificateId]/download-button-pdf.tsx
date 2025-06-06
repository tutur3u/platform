'use client';

import { BASE_URL } from '@/constants/common';
import { Button } from '@tuturuuu/ui/button';
import { FileText } from '@tuturuuu/ui/icons';
import { useTranslations } from 'next-intl';
import { useCallback } from 'react';

export function DownloadButtonPDF({
  certificateId,
  wsId,
  className = '',
  variant = 'outline',
}: {
  certificateId: string;
  wsId: string;
  className?: string;
  variant?: 'default' | 'outline' | 'ghost' | 'link' | 'destructive';
}) {
  const t = useTranslations('certificates');

  const handleDownload = useCallback(async () => {
    try {
      const res = await fetch(
        `${BASE_URL}/api/v1/certificates/${certificateId}/generate`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            certID: certificateId,
            title: t('title'),
            certifyText: t('certify_text'),
            completionText: t('completion_text'),
            offeredBy: t('offered_by'),
            completionDateLabel: t('completion_date'),
            certificateIdLabel: t('certificate_id'),
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
  }, [certificateId, wsId]);

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
