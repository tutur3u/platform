import { notFound, redirect } from 'next/navigation';
import { buildGatewayRedirectUrl, getGatewayApp } from '@/lib/apps-registry';

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
