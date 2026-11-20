import { NO_INDEX_ROBOTS } from '@tuturuuu/utils/common/metadata';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import {
  buildGatewayRedirectUrl,
  GATEWAY_SEARCH_HEADER,
  getGatewayApp,
} from '@/lib/apps-registry';

export const metadata: Metadata = {
  robots: NO_INDEX_ROBOTS,
};

interface Props {
  params: Promise<{
    appSlug: string;
    path?: string[];
  }>;
}

export default async function GatewayRedirectPage({ params }: Props) {
  const { appSlug, path } = await params;
  const app = getGatewayApp(appSlug);

  if (!app) {
    notFound();
  }

  redirect(
    buildGatewayRedirectUrl({
      app,
      path,
      search: (await headers()).get(GATEWAY_SEARCH_HEADER) ?? '',
    })
  );
}
