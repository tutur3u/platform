import { ENABLE_CMS_GAMES_CONFIG_ID } from '@tuturuuu/internal-api/workspace-configs';
import { getWorkspaceConfig } from '@tuturuuu/utils/workspace-helper';
import { isCmsGamesConfigEnabled } from './cms-games-shared';

export async function getCmsGamesEnabled(workspaceId: string) {
  return isCmsGamesConfigEnabled(
    await getWorkspaceConfig(workspaceId, ENABLE_CMS_GAMES_CONFIG_ID)
  );
}
