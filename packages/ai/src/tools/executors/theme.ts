import {
  manageWorkspaceSchema,
  showWorkspaceArtifactSchema,
} from '../../workspace-artifacts';
import type { MiraToolContext } from '../mira-tools';
import { getWorkspaceContextWorkspaceId } from '../workspace-context';

export async function executeSetTheme(
  args: Record<string, unknown>,
  _ctx: MiraToolContext
) {
  const theme = args.theme as string;
  const valid = ['light', 'dark', 'system'];
  if (!valid.includes(theme)) {
    return {
      error: `Invalid theme "${theme}". Must be one of: ${valid.join(', ')}`,
    };
  }

  // Return a client-side action marker — the chat UI will detect this
  // and apply the theme change via next-themes.
  return {
    success: true,
    action: 'set_theme',
    theme,
    message: `Theme changed to ${theme}`,
  };
}

export async function executeSetSidebar(args: Record<string, unknown>) {
  const behavior = args.behavior;
  if (
    !['expanded', 'collapsed', 'hover', 'hidden'].includes(String(behavior))
  ) {
    return { error: 'Invalid sidebar behavior' };
  }
  return { success: true, action: 'set_sidebar', behavior };
}

export async function executeShowWorkspaceArtifact(
  args: Record<string, unknown>,
  ctx: MiraToolContext
) {
  const parsed = showWorkspaceArtifactSchema.safeParse(args);
  if (!parsed.success)
    return { error: 'Invalid artifact presentation or layout' };
  return {
    success: true,
    action: 'show_workspace_artifact',
    ...parsed.data,
    wsId: getWorkspaceContextWorkspaceId(ctx),
  };
}

export async function executeManageWorkspace(
  args: Record<string, unknown>,
  ctx: MiraToolContext
) {
  const parsed = manageWorkspaceSchema.safeParse(args);
  if (!parsed.success) return { error: 'Invalid workspace operation' };
  return {
    success: true,
    action: 'manage_workspace',
    ...parsed.data,
    wsId: getWorkspaceContextWorkspaceId(ctx),
  };
}
