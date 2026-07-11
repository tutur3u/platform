import { toWorkspaceSlug } from '@tuturuuu/utils/constants';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { getFinanceWorkspaceContext } from '@/lib/workspace';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function WorkspaceTransactionCategoriesRedirect({
  params,
  searchParams,
}: Props) {
  await connection();

  const { wsId: id } = await params;
  const context = await getFinanceWorkspaceContext(id);
  const workspaceSlug = context
    ? toWorkspaceSlug(context.wsId, {
        personal: !!context.workspace.personal,
      })
    : id;
  const url = new URL(`/${workspaceSlug}/categories`, 'https://finance.local');

  for (const [key, value] of Object.entries(await searchParams)) {
    if (!value) continue;
    const values = Array.isArray(value) ? value : [value];
    for (const entry of values) {
      url.searchParams.append(key, entry);
    }
  }

  redirect(`${url.pathname}${url.search}`);
}
