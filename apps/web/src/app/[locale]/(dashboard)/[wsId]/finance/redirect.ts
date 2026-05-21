import { toWorkspaceSlug } from '@tuturuuu/utils/constants';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { notFound, redirect } from 'next/navigation';
import { getFinanceAppOrigin } from '@/lib/finance-app-url';

export type FinanceRedirectSearchParams = Record<
  string,
  boolean | number | string | string[] | null | undefined
>;

export function buildFinanceAppRedirectUrl({
  origin,
  path = '',
  searchParams,
  workspaceSlug,
}: {
  origin: string;
  path?: string;
  searchParams?: FinanceRedirectSearchParams;
  workspaceSlug: string;
}) {
  const normalizedPath = path ? `/${path.replace(/^\/+/u, '')}` : '';
  const url = new URL(`/${workspaceSlug}${normalizedPath}`, origin);

  for (const [key, value] of Object.entries(searchParams ?? {})) {
    if (value === undefined) {
      continue;
    }

    const values = Array.isArray(value) ? value : [value];

    for (const entry of values) {
      if (entry !== null && entry !== undefined) {
        url.searchParams.append(key, String(entry));
      }
    }
  }

  return url.toString();
}

export async function redirectToFinanceApp({
  params,
  path,
  searchParams,
}: {
  params: Promise<{ wsId: string }>;
  path?: string;
  searchParams?: Promise<FinanceRedirectSearchParams>;
}) {
  const [{ wsId: id }, resolvedSearchParams] = await Promise.all([
    params,
    searchParams,
  ]);
  const workspace = await getWorkspace(id);

  if (!workspace) {
    notFound();
  }

  redirect(
    buildFinanceAppRedirectUrl({
      origin: getFinanceAppOrigin(),
      path,
      searchParams: resolvedSearchParams,
      workspaceSlug: toWorkspaceSlug(workspace.id, {
        personal: !!workspace.personal,
      }),
    })
  );
}
