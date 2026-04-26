import {
  getWorkspaceExternalProjectStudio,
  withForwardedInternalApiAuth,
} from '@tuturuuu/internal-api';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
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

  // const t = await getTranslations('external-projects');
  // const strings = buildCmsStrings(t);

  return (
    <main className="-m-2 -mt-17 flex h-svh min-h-0 w-[calc(100%+1rem)] max-w-none flex-col overflow-hidden bg-background md:-m-4 md:h-screen md:w-[calc(100%+2rem)]">
      {/* <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-border/70 border-b px-4 py-2">
        <div className="min-w-0">
          <h1 className="truncate font-semibold text-lg">{entry.title}</h1>
        </div>
        <a
          className="rounded-md border border-border/70 px-3 py-2 text-sm transition hover:bg-muted"
          href={`/${wsId}/library?entryId=${entryId}`}
        >
          {strings.backToEpmAction}
        </a>
      </header> */}
      <iframe
        allow="autoplay; fullscreen; gamepad; xr-spatial-tracking"
        className="h-full min-h-0 w-full flex-1 border-0 bg-black"
        src={entryUrl}
        title={entry.title}
      />
    </main>
  );
}
