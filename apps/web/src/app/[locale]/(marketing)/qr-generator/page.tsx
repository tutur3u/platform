import { NO_INDEX_ROBOTS } from '@tuturuuu/utils/common/metadata';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { buildQrAppUrl } from '@/lib/qr-app-url';

export const metadata: Metadata = {
  title: 'QR Code Generator',
  description: 'Create branded QR codes instantly with the Tuturuuu generator.',
  robots: NO_INDEX_ROBOTS,
};

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function QRGeneratorPage({ searchParams }: Props) {
  redirect(buildQrAppUrl(await searchParams).toString());
}
