import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { edufestHall } from '@tuturuuu/worlds/edufest-hall';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { WorldEditor } from './world-editor';

type Props = { params: Promise<{ wsId: string }> };

export default function WorldsEditorPage({ params }: Props) {
  return (
    <Suspense>
      <AuthorizedEditor params={params} />
    </Suspense>
  );
}

async function AuthorizedEditor({ params }: Props) {
  await connection();

  const { wsId } = await params;
  const permissions = await getPermissions({ wsId });
  if (
    !permissions ||
    permissions.withoutPermission('manage_workspace_settings')
  ) {
    notFound();
  }

  return <WorldEditor key={permissions.wsId} sample={edufestHall} />;
}
