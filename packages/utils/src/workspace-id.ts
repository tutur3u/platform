import { z } from 'zod';
import {
  normalizeWorkspaceContextId,
  PERSONAL_WORKSPACE_SLUG,
} from './constants';

export const workspaceIdSchema = z
  .string()
  .trim()
  .min(1)
  .transform(normalizeWorkspaceContextId)
  .pipe(z.union([z.guid(), z.literal(PERSONAL_WORKSPACE_SLUG)]))
  .brand<'WorkspaceId'>();

export type WorkspaceId = z.infer<typeof workspaceIdSchema>;
