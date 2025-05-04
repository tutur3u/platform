import { mockCertificates } from '@/app/[locale]/(dashboard)/certificate/mock-data';
import { NextResponse } from 'next/server';

export async function GET(
  _request: Request,
  { params }: { params: { certId: string } }
) {
  const certificate = mockCertificates.find(
    (cert) => cert.certificateId === params.certId
  );

  if (!certificate) {
    return NextResponse.json(
      { message: 'Certificate not found' },
      { status: 404 }
    );
  }

  return NextResponse.json(certificate);
}
