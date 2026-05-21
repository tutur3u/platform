import { toWorkspaceSlug } from '@tuturuuu/utils/constants';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import WorkspaceWrapper from '@/components/workspace-wrapper';
import { getDriveAppOrigin } from '@/lib/drive-app-url';

export const metadata: Metadata = {
  title: 'Drive',
  description: 'Manage Drive in your Tuturuuu workspace.',
};

interface Props {
  params: Promise<{
    wsId: string;
  }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function appendSearchParams(
  url: URL,
  searchParams: Record<string, string | string[] | undefined>
) {
  for (const [key, value] of Object.entries(searchParams)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item !== undefined) url.searchParams.append(key, item);
      }
      continue;
    }

    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }
}

export default async function WorkspaceStorageObjectsPage({
  params,
  searchParams,
}: Props) {
  const query = await searchParams;

  return (
    <WorkspaceWrapper params={params}>
      {async ({ wsId, isPersonal, isRoot }) => {
        const permissions = await getPermissions({
          wsId,
        });

        if (!permissions) {
          notFound();
        }

        if (permissions.withoutPermission('manage_drive')) {
          redirect(`/${wsId}`);
        }

        const workspaceSlug = toWorkspaceSlug(wsId, {
          personal: isPersonal,
        });
        const targetUrl = new URL(
          `/${encodeURIComponent(isRoot ? 'internal' : workspaceSlug)}`,
          getDriveAppOrigin()
        );
        appendSearchParams(targetUrl, query);

        redirect(targetUrl.toString());
      }}
    </WorkspaceWrapper>
  );
}
