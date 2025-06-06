'use client';

import { Button } from '@tuturuuu/ui/button';
import { ImageIcon } from '@tuturuuu/ui/icons';
import { Separator } from '@tuturuuu/ui/separator';
import html2canvas from 'html2canvas';
import { useTranslations } from 'next-intl';
import { useCallback } from 'react';
import { DownloadButtonPDF } from './[certificateId]/download-button-pdf';
import { CertificateProps } from './[certificateId]/page';

export default function Certificate({ certDetails, wsId }: CertificateProps) {
  const t = useTranslations('certificates');
  const {
    courseName,
    studentName,
    completionDate,
    certificateId,
    courseLecturer,
  } = certDetails;

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
          Array.from(clonedDoc.getElementsByTagName('link')).forEach((link: HTMLLinkElement) => {
            link.removeAttribute('integrity');
            link.removeAttribute('crossorigin');
          });
        },
      });

      const link = document.createElement('a');
      link.download = `certificate-${certificateId}.png`;
      link.href = canvas.toDataURL('image/png', 1.0);
      link.click();
    } catch (error) {
      console.error('Error generating PNG:', error);
      throw error;
    }
  }, [certificateId]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4">
      <div className="w-full max-w-4xl">
        <div
          id="certificate-area"
          style={{
            position: 'relative',
            background: 'white',
            color: '#000000',
            padding: '4rem',
            borderRadius: '1rem',
            boxShadow: '0 10px 15px rgba(0, 0, 0, 0.1)',
            border: '1px solid #e5e7eb',
            overflow: 'hidden',
          }}
        >
          <img
            src="/media/logos/watermark.png"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              opacity: 0.12,
              zIndex: 0,
              objectFit: 'contain',
              objectPosition: 'center',
              pointerEvents: 'none',
            }}
            alt="Certificate watermark"
          />

          <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
            <h1
              style={{
                fontSize: '2.25rem',
                fontWeight: 'bold',
                marginBottom: '0.5rem',
                color: '#1f2937',
              }}
            >
              {t('title')}
            </h1>
            <Separator className="my-8" />
          </div>

          <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
            <p style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>
              {t('certify_text')}
            </p>
            <h2
              style={{
                fontSize: '1.875rem',
                fontWeight: 'bold',
                marginBottom: '1rem',
                color: '#1f2937',
              }}
            >
              {studentName}
            </h2>
            <p style={{ fontSize: '1.25rem' }}>{t('completion_text')}</p>
            <h3
              style={{
                fontSize: '1.5rem',
                fontWeight: 'bold',
                marginTop: '1rem',
                marginBottom: '2rem',
                color: '#1f2937',
              }}
            >
              {courseName}
            </h3>
            <p style={{ fontSize: '1.25rem' }}>{t('offered_by')}</p>
            <h3
              style={{
                fontSize: '1.5rem',
                fontWeight: 'bold',
                marginTop: '1rem',
                marginBottom: '2rem',
                color: '#1f2937',
              }}
            >
              {courseLecturer}
            </h3>
          </div>

          <div
            style={{
              marginTop: '4rem',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-end',
            }}
          >
            <div>
              <p style={{ fontSize: '0.875rem', color: '#4b5563' }}>
                {t('completion_date')}:
              </p>
              <p style={{ fontWeight: '600' }}>{completionDate}</p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontSize: '0.875rem', color: '#4b5563' }}>
                {t('certificate_id')}:
              </p>
              <p style={{ fontFamily: 'monospace', fontSize: '0.875rem' }}>
                {certificateId}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-center gap-2">
          <Button onClick={handlePNG}>
            <ImageIcon className="mr-1 h-4 w-4" />
            {t('download_button')} (PNG)
          </Button>
          <DownloadButtonPDF certificateId={certificateId} wsId={wsId} variant='default' />
        </div>
      </div>
    </div>
  );
}
