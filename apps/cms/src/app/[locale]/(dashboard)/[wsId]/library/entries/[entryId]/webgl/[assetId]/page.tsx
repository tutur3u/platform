import {
  getWorkspaceExternalProjectStudio,
  withForwardedInternalApiAuth,
} from '@tuturuuu/internal-api';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { buildCmsStrings } from '@/features/cms-studio/cms-strings';
import { getCmsWorkspaceAccess } from '@/lib/external-projects/access';

interface Props {
  params: Promise<{
    assetId: string;
    entryId: string;
    wsId: string;
  }>;
}

function getWebglEntryUrl(metadata: unknown) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return null;
  }

  const record = metadata as Record<string, unknown>;
  return record.kind === 'webgl-package' && typeof record.entryUrl === 'string'
    ? record.entryUrl
    : null;
}

export default async function CmsWebglPackagePlayerPage({ params }: Props) {
  const { assetId, entryId, wsId } = await params;
  const access = await getCmsWorkspaceAccess(wsId);

  if (access.isInternalWorkspace && access.canAccessAdmin) {
    redirect(`/${wsId}/projects`);
  }

  if (!access.canAccessWorkspace) {
    redirect('/no-access');
  }

  const requestHeaders = await headers();
  const studio = await getWorkspaceExternalProjectStudio(
    access.normalizedWorkspaceId,
    withForwardedInternalApiAuth(requestHeaders)
  );
  const entry = studio.entries.find((item) => item.id === entryId);
  const asset = studio.assets.find(
    (item) =>
      item.id === assetId &&
      item.entry_id === entryId &&
      item.asset_type === 'webgl-package'
  );
  const entryUrl = getWebglEntryUrl(asset?.metadata);

  if (!entry || !asset || !entryUrl) {
    notFound();
  }

  const t = await getTranslations('external-projects');
  const strings = buildCmsStrings(t);

  return (
    <main className="flex h-[calc(100svh-5rem)] min-h-0 flex-col overflow-hidden bg-background">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-border/70 border-b px-4 py-3">
        <div className="min-w-0">
          <div className="text-muted-foreground text-xs uppercase tracking-[0.18em]">
            {strings.webglPackageTitle}
          </div>
          <h1 className="truncate font-semibold text-lg">{entry.title}</h1>
        </div>
        <a
          className="rounded-md border border-border/70 px-3 py-2 text-sm transition hover:bg-muted"
          href={`/${wsId}/library?entryId=${entryId}`}
        >
          {strings.backToEpmAction}
        </a>
      </header>
      <iframe
        allow="autoplay; fullscreen; gamepad; xr-spatial-tracking"
        className="h-full min-h-0 w-full flex-1 border-0 bg-black"
        src={entryUrl}
        title={entry.title}
      />
    </main>
  );
}
