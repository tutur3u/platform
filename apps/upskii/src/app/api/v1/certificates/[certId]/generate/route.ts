import { CertificateProps } from '@/app/[locale]/(dashboard)/[wsId]/certificate/[certID]/page';
import { DEV_MODE } from '@/constants/common';
import { getCurrentUser } from '@tuturuuu/utils/user-helper';
import { NextRequest } from 'next/server';
import puppeteer from 'puppeteer';

type format = 'pdf' | 'png';

const URL = DEV_MODE ? 'http://localhost:7806' : 'https://upskii.com';

const getCertificateData = async (certID: string) => {
  // Available in the mock data: "CERT-2023-10-01-d3c4f4be-7b44-432b-8fe3-b8bcd3a3c2d5", "CERT-2024-03-15-a1b2c3d4-e5f6-4321-9876-123456789abc", "CERT-2024-04-20-98765432-abcd-efgh-ijkl-mnopqrstuvwx"

  const response = await fetch(`${URL}/api/v1/certificates/${certID}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch certificate data');
  }

  const userDetails = await getCurrentUser();

  const certDetails = await response.json();

  // Replace the student name in the response with the user's name

  if (userDetails) {
    certDetails.studentName = userDetails.display_name;
  }

  return certDetails;
};

const renderHTML = (data: {
  certData: CertificateProps['certDetails'];
  title: string;
  certify_text: string;
  completion_text: string;
  offered_by: string;
  completion_date: string;
  certificate_id: string;
}) => {
  const htmlStyles = `
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
        background: #f8fafc;
      }
      #certificate-container {
        width: 100%;
        height: 100%;
        display: flex;
        justify-content: center;
        align-items: center;
        box-sizing: border-box;
        padding: 2rem;
      }
    </style>
  `;

  const htmlContent = `
    <html>
      <head>
        <title>Certificate</title>
        ${htmlStyles}
      </head>
      <body>
        <div id="certificate-container">
          <div
            id="certificate-area"
            style="
              width: 800px;
              background: white;
              color: #000000;
              padding: 4rem;
              border-radius: 1rem;
              box-shadow: 0 10px 15px rgba(0, 0, 0, 0.1);
              border: 1px solid #e5e7eb;
              position: relative;
            "
          >
            <div
              style="
                background-image: url(https://upskii.com/media/logos/light.png);
                background-position: center;
                background-size: 400px;
                opacity: 0.15;
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                z-index: 0;
              "
            ></div>

            <div style="text-align: center; margin-bottom: 3rem;">
              <h1 style="font-size: 2.25rem; font-weight: bold; margin-bottom: 0.5rem; color: #1f2937;">
                ${data.title}
              </h1>
              <hr style="margin: 2rem 0; border: none; border-top: 1px solid #ccc;" />
            </div>

            <div style="text-align: center; margin-bottom: 3rem;">
              <p style="font-size: 1.25rem; margin-bottom: 1rem;">
                ${data.certify_text}
              </p>
              <h2 style="font-size: 1.875rem; font-weight: bold; margin-bottom: 1rem; color: #1f2937;">
                ${data.certData.studentName}
              </h2>
              <p style="font-size: 1.25rem;">${data.completion_text}</p>
              <h3 style="font-size: 1.5rem; font-weight: bold; margin-top: 1rem; margin-bottom: 2rem; color: #1f2937;">
                ${data.certData.courseName}
              </h3>
              <p style="font-size: 1.25rem;">${data.offered_by}</p>
              <h3 style="font-size: 1.5rem; font-weight: bold; margin-top: 1rem; margin-bottom: 2rem; color: #1f2937;">
                ${data.certData.courseLecturer}
              </h3>
            </div>

            <div style="margin-top: 4rem; display: flex; justify-content: space-between; align-items: flex-end;">
              <div>
                <p style="font-size: 0.875rem; color: #4b5563;">
                  ${data.completion_date}:
                </p>
                <p style="font-weight: 600;">${data.certData.completionDate}</p>
              </div>
              <div style="text-align: right;">
                <p style="font-size: 0.875rem; color: #4b5563;">
                  ${data.certificate_id}:
                </p>
                <p style="font-family: monospace; font-size: 0.875rem;">
                  ${data.certData.certificateId}
                </p>
              </div>
            </div>
          </div>
        </div>
      </body>
    </html>
  `;

  return htmlContent;
};

const generatePDF = async (htmlContent: string) => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

  const pdfBuffer = await page.pdf({
    format: 'A4',
    printBackground: true,
  });

  await browser.close();
  return pdfBuffer;
};

const generatePNG = async (htmlContent: string) => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

  // Measure the certificate area's bounding box height
  const certHeight = await page.evaluate(() => {
    const el = document.getElementById('certificate-area');
    if (!el) return 1200; // fallback
    const rect = el.getBoundingClientRect();
    return Math.ceil(rect.height);
  });

  await page.setViewport({
    width: 800,
    height: certHeight,
    deviceScaleFactor: 2,
  });

  const cert = await page.$('#certificate-area');
  if (!cert) {
    throw new Error('Certificate area not found');
  }

  const pngbuffer = await cert.screenshot({ type: 'png' });

  await browser.close();
  return pngbuffer;
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ certId: string }> }
) {
  try {
    const {
      title,
      certifyText,
      completionText,
      offeredBy,
      completionDateLabel,
      certificateIdLabel,
    } = await req.json();
    const { certId } = await params;

    const format = req.nextUrl.searchParams.get('format') as format;

    if (format !== 'pdf' && format !== 'png') {
      return new Response('Invalid format', { status: 400 });
    }

    if (!certId) {
      return new Response('Certificate ID is required', { status: 400 });
    }

    const certData = await getCertificateData(certId);

    const certHTML = renderHTML({
      certData,
      title,
      certify_text: certifyText,
      completion_text: completionText,
      offered_by: offeredBy,
      completion_date: completionDateLabel,
      certificate_id: certificateIdLabel,
    });

    // Generate PDF or PNG based on the format

    let fileBuffer;
    if (format === 'pdf') {
      fileBuffer = await generatePDF(certHTML);
    } else if (format === 'png') {
      fileBuffer = await generatePNG(certHTML);
    }

    return new Response(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': format === 'pdf' ? 'application/pdf' : 'image/png',
        'Content-Disposition': `attachment; filename="${certId}.${format}"`,
      },
    });
  } catch (error) {
    console.error('PDF generation failed:', error);
    return new Response('Error generating PDF', { status: 500 });
  }
}
