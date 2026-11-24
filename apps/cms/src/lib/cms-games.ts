import { ENABLE_CMS_GAMES_CONFIG_ID } from '@tuturuuu/internal-api/workspace-configs';
import { getWorkspaceConfig } from '@tuturuuu/utils/workspace-helper';
import { cache } from 'react';
import { isCmsGamesConfigEnabled } from './cms-games-shared';

/** One config read per workspace per request (navigation and pages share it). */
export const getCmsGamesEnabled = cache(async (workspaceId: string) =>
  isCmsGamesConfigEnabled(
    await getWorkspaceConfig(workspaceId, ENABLE_CMS_GAMES_CONFIG_ID)
  )
);
