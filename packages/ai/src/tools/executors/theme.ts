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
    message:
      'Artifact UI command completed. This UI command did not fetch product data; the panel fetches its own data separately. Do not repeat this successful command. Continue only with other requested actions, then answer.',
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
    message:
      'Workspace UI command completed. Do not repeat this successful command to verify it. Preserve panels the user asked to keep; once the requested actions are complete, answer without further UI calls.',
    ...parsed.data,
    wsId: getWorkspaceContextWorkspaceId(ctx),
  };
}
