import { Suspense } from 'react';
import { supportedLocales } from '@/i18n/routing';
import { tools } from '../data';
import ClientPage from './client-page';

export function generateStaticParams() {
  return supportedLocales.flatMap((locale) =>
    tools.map((tool) => ({ locale, toolId: tool.id }))
  );
}

export default async function ToolDetailsPage({
  params,
}: {
  params: Promise<{
    locale: string;
    toolId: string;
  }>;
}) {
  return (
    <Suspense>
      <ClientPage params={params} />
    </Suspense>
  );
}
