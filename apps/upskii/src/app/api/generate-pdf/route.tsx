import { NextRequest } from 'next/server';
import puppeteer from 'puppeteer';

const generatePdf = async (htmlContent: string) => {
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

export async function POST(req: NextRequest) {
  try {
    const { documentData, certID, studentName } = await req.json();

    console.log(
      `Generating PDF for Cert ID: ${certID}, Student Name: ${studentName}`
    );

    const pdfBuffer = await generatePdf(documentData);

    return new Response(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${certID}.pdf"`,
      },
    });
  } catch (error) {
    console.error('PDF generation failed:', error);
    return new Response('Error generating PDF', { status: 500 });
  }
}
