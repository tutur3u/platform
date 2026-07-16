import { NO_INDEX_ROBOTS } from '@tuturuuu/utils/common/metadata';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { buildGatewayRedirectUrl, getGatewayApp } from '@/lib/apps-registry';

export const metadata: Metadata = {
  robots: NO_INDEX_ROBOTS,
};

interface Props {
  params: Promise<{
    appSlug: string;
    path?: string[];
  }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function GatewayRedirectPage({
  params,
  searchParams,
}: Props) {
  const { appSlug, path } = await params;
  const app = getGatewayApp(appSlug);

  if (!app) {
    notFound();
  }

  redirect(
    buildGatewayRedirectUrl({
      app,
      path,
      searchParams: await searchParams,
    })
  );
}
