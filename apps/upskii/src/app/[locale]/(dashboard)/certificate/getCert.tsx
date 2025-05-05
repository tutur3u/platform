'use client';

import { useCallback, useRef } from 'react';
import html2canvas from 'html2canvas';
import { Button } from '@tuturuuu/ui/button';
import { ImageIcon, FileText } from '@tuturuuu/ui/icons';
import { Separator } from '@tuturuuu/ui/separator';
import { useTranslations } from 'next-intl';
import { CertificateProps } from './[certID]/page';

export default function Certificate({ certDetails }: CertificateProps) {
    const t = useTranslations('certificates');
    const { courseName, studentName, completionDate, certificateId, courseLecturer } = certDetails;
    const printableRef = useRef<HTMLDivElement>(null);
    
    const handlePDF = useCallback(async () => {
        const printContent = printableRef.current;
        if (!printContent) return;

        const printWindow = window.open('', '_blank');
        if (!printWindow) {
          alert('Please allow popups for this website');
          return;
        }
      
        // Clone the content and convert computed styles to inline styles
        const styledContent = printContent.cloneNode(true) as HTMLElement;
        const originalElements = printContent.getElementsByTagName('*');
        const clonedElements = styledContent.getElementsByTagName('*');
      
        for (let i = 0; i < clonedElements.length; i++) {
          const el = clonedElements[i] as HTMLElement;
          const originalElement = originalElements[i];
          if (!originalElement) continue;
          const computedStyle = window.getComputedStyle(originalElement);
          el.style.cssText = Array.from(computedStyle).reduce((str, prop) => {
            return `${str}${prop}:${computedStyle.getPropertyValue(prop)};`;
          }, '');
        }
      
        const printStyles = `
          <style>
            @page {
              size: A4 landscape;
              margin: 0;
            }
            html, body {
              margin: 0;
              padding: 0;
              width: 100%;
              height: 100%;
              font-family: 'Arial', sans-serif;
              background: white;
            }
            #certificate-container {
              width: 100%;
              height: 100%;
              display: flex;
              justify-content: center;
              align-items: center;
              box-sizing: border-box;
              padding: 2cm;
            }
          </style>
        `;

        const printableHTML = `
          <html>
            <head>
              <title>Certificate</title>
              ${printStyles}
            </head>
            <body>
              <div id="certificate-container">
                ${styledContent.outerHTML}
              </div>
            </body>
          </html>
        `;
    try {
        const res = await fetch('/api/generate-pdf', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                documentData: printableHTML,
                certID: certificateId,
                studentName: studentName,
            }),
        });
        if (res.ok){
            const blob = new Blob([await res.arrayBuffer()], { type: "application/pdf" });
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = `${certificateId}.pdf`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            }
        } catch (error) {
            console.error('Error generating PDF:', error);
        }
    }, []);


    const handleDownload = useCallback(() => {
        const element = document.getElementById('certificate-area');
        if (element) {
            html2canvas(element, {
                useCORS: true,
                allowTaint: true,
                backgroundColor: null,
                scale: 2,
                logging: false,
                onclone: (clonedDoc) => {
                    Array.from(clonedDoc.getElementsByTagName('link')).forEach(link => {
                        link.removeAttribute('integrity');
                        link.removeAttribute('crossorigin');
                    });
                }
            }).then((canvas) => {
                const link = document.createElement('a');
                link.download = `certificate-${certificateId}-${studentName}.png`;
                link.href = canvas.toDataURL('image/png', 1.0);
                link.click();
            });
        }
    }, [certificateId]);

    return (
        <div className="flex flex-col items-center justify-center min-h-screen p-4">
            <div className="w-full max-w-4xl">
                <div
                    id="certificate-area"
                    ref={printableRef}
                    style={{
                        background: 'white',
                        color: '#000000',
                        padding: '4rem',
                        borderRadius: '1rem',
                        boxShadow: '0 10px 15px rgba(0, 0, 0, 0.1)',
                        border: '1px solid #e5e7eb',
                        position: 'relative',
                    }}>
                        {/* Watermark image for the certificate */}
                    <div style={{
                            backgroundImage: 'url(/media/logos/light.png)',
                            backgroundPosition: 'center',
                            backgroundSize: '400px',
                            opacity: 0.15,
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            zIndex: 0,
                            
                        }} />

                    <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
                        <h1 style={{ fontSize: '2.25rem', fontWeight: 'bold', marginBottom: '0.5rem', color: '#1f2937' }}>{t('title')}</h1>
                        <Separator className="my-8" />
                    </div>

                    <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
                        <p style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>{t('certify_text')}</p>
                        <h2 style={{ fontSize: '1.875rem', fontWeight: 'bold', marginBottom: '1rem', color: '#1f2937' }}>{studentName}</h2>
                        <p style={{ fontSize: '1.25rem' }}>{t('completion_text')}</p>
                        <h3 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginTop: '1rem', marginBottom: '2rem', color: '#1f2937' }}>{courseName}</h3>
                        <p style={{ fontSize: '1.25rem' }}>{t('offered_by')}</p>
                        <h3 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginTop: '1rem', marginBottom: '2rem', color: '#1f2937' }}>{courseLecturer}</h3>
                    </div>

                    <div style={{ marginTop: '4rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                        <div>
                            <p style={{ fontSize: '0.875rem', color: '#4b5563' }}>{t('completion_date')}:</p>
                            <p style={{ fontWeight: '600' }}>{completionDate}</p>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                            <p style={{ fontSize: '0.875rem', color: '#4b5563' }}>{t('certificate_id')}:</p>
                            <p style={{ fontFamily: 'monospace', fontSize: '0.875rem' }}>{certificateId}</p>
                        </div>
                    </div>
                </div>

                <div className="mt-6 flex justify-center gap-2">
                    <Button onClick={handleDownload}>
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
