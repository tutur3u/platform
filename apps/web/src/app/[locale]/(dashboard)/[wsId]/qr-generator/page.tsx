import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { buildQrAppUrl } from '@/lib/qr-app-url';

export const metadata: Metadata = {
  title: 'QR Generator',
  description: 'Manage QR Generator in your Tuturuuu workspace.',
};

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function QRGeneratorPage({ searchParams }: Props) {
  redirect(buildQrAppUrl(await searchParams).toString());
}
