'use client';

import { CertificateProps } from './[certID]/page';
import { Button } from '@tuturuuu/ui/button';
import { FileText, ImageIcon } from '@tuturuuu/ui/icons';
import { Separator } from '@tuturuuu/ui/separator';
import { useTranslations } from 'next-intl';
import { useCallback } from 'react';
import html2canvas from 'html2canvas';

export default function Certificate({ certDetails }: CertificateProps) {
  const t = useTranslations('certificates');
  const {
    courseName,
    studentName,
    completionDate,
    certificateId,
    courseLecturer,
  } = certDetails;

  const handlePDF = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/v1/certificates/${certificateId}/generate?format=pdf`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            certID: certificateId,
            title: String(t('title')),
            certifyText: String(t('certify_text')),
            completionText: String(t('completion_text')),
            offeredBy: String(t('offered_by')),
            completionDateLabel: String(t('completion_date')),
            certificateIdLabel: String(t('certificate_id')),
          }),
        }
      );

      if (!res.ok) {
        throw new Error(`Server error: ${res.status} ${res.statusText}`);
      }

      const blob = new Blob([await res.arrayBuffer()], {
        type: 'application/pdf',
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${certificateId}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url); // Clean up the URL object
    } catch (error) {
      console.error('Error generating PDF:', error);
    }
  }, [certificateId]);

  const handlePNG = useCallback(async () => {
    const element = document.getElementById('certificate-area');
    if (element) {
      html2canvas(element).then((canvas) => {
        const link = document.createElement('a');
        link.download = `certificate-${certificateId}.png`;
        link.href = canvas.toDataURL();
        link.click();
      });
    }
  }, [certificateId]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4">
      <div className="w-full max-w-4xl">
        <div
          id="certificate-area"
          style={{
            background: 'white',
            color: '#000000',
            padding: '4rem',
            borderRadius: '1rem',
            boxShadow: '0 10px 15px rgba(0, 0, 0, 0.1)',
            border: '1px solid #e5e7eb',
            position: 'relative',
          }}
        >
          {/* Watermark image for the certificate */}
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
          <Button onClick={handlePDF}>
            <FileText className="mr-2 h-4 w-4" />
            {t('download_button')} (PDF)
          </Button>
        </div>
      </div>
    </div>
  );
}
