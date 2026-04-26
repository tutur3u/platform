import { getTranslations } from 'next-intl/server';

interface Props {
  params: Promise<{
    assetId: string;
    wsId: string;
  }>;
}

export default async function PublicWebglGamePage({ params }: Props) {
  const { assetId, wsId } = await params;
  const t = await getTranslations('external-projects');
  const src = `/api/v1/workspaces/${encodeURIComponent(
    wsId
  )}/external-projects/assets/${encodeURIComponent(assetId)}/webgl/index.html`;

  return (
    <main className="fixed inset-0 min-h-svh overflow-hidden bg-black">
      <iframe
        allow="autoplay; fullscreen; gamepad; xr-spatial-tracking"
        className="h-svh w-screen border-0 bg-black"
        src={src}
        title={t('epm.webgl_package_title')}
      />
    </main>
  );
}
