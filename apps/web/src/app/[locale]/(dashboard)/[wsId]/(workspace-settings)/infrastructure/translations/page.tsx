import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import enMessages from '@/../messages/en.json';
import viMessages from '@/../messages/vi.json';
import TranslationsComparison from './translations-comparison';

export default async function TranslationsPage() {
  const { containsPermission } = await getPermissions({
    wsId: ROOT_WORKSPACE_ID,
  });

  const canGenerateWithAI = containsPermission('manage_workspace_roles');

  return (
    <TranslationsComparison
      enMessages={enMessages}
      viMessages={viMessages}
      canGenerateWithAI={canGenerateWithAI}
    />
  );
}
