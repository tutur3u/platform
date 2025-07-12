import { verifySecret } from '@tuturuuu/utils/workspace-helper';
import { notFound } from 'next/navigation';

export default async function LinkShortenerLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{
    wsId: string;
  }>;
}) {
  const { wsId } = await params;

  if (
    wsId !== '00000000-0000-0000-0000-000000000000' &&
    !(await verifySecret({
      forceAdmin: true,
      wsId,
      name: 'ENABLE_LINK_SHORTENER',
      value: 'true',
    }))
  )
    return notFound();

  return children;
}
