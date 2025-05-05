import { mockCertificates } from '@/app/[locale]/(dashboard)/certificate/mock-data';
import { NextResponse } from 'next/server';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ certId: string }>  }
) {
  // Extract the certificate ID from the request parameters
  const { certId } = await params;
  const certificate = mockCertificates.find(cert => cert.certificateId === certId);

  if (!certificate) {
    return NextResponse.json(
      { message: 'Certificate not found' },
      { status: 404 }
    );
  }

  return NextResponse.json(certificate);
}