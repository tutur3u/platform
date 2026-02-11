import { type ReactNode, Suspense } from 'react';
import ClientLayout from './client-layout';

export default function ToolsLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{
    locale: string;
  }>;
}) {
  return (
    <Suspense>
      <ClientLayout params={params}>{children}</ClientLayout>
    </Suspense>
  );
}
