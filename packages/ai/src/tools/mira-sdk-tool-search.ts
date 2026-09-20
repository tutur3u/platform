import type { PermissionId } from '@tuturuuu/types';
import { type ToolSet, toolSearch } from 'ai';
import { MIRA_TOOL_PERMISSIONS } from './mira-tool-metadata';
import type { MiraToolName } from './mira-tool-names';
import type { MiraToolContext } from './mira-tool-types';
import { getWorkspaceContextWorkspaceId } from './workspace-context';

type StepPolicy = {
  activeTools: string[];
  toolChoice?: 'required' | 'none';
};

/** Each generation owns discovery state; execution retains the original guards. */
export function createMiraSdkToolSearch(
  originalTools: ToolSet,
  ctx: MiraToolContext,
  withoutPermission?: (permission: PermissionId) => boolean
) {
  const tools: ToolSet = Object.fromEntries(
    Object.entries(originalTools).map(([name, definition]) => [
      name,
      name === 'search_tools'
        ? toolSearch()
        : { ...definition, deferLoading: true },
    ])
  );

  async function prepareStep(policy: StepPolicy) {
    if (policy.toolChoice === 'none') {
      return { ...policy, activeTools: [] };
    }
    const workspaceId = getWorkspaceContextWorkspaceId(ctx);
    const allowed = new Set<string>();
    for (const name of Object.keys(tools)) {
      const permission = MIRA_TOOL_PERMISSIONS[name as MiraToolName];
      const required = permission
        ? Array.isArray(permission)
          ? permission
          : [permission]
        : [];
      let authorized = required.length === 0;
      if (!authorized) {
        try {
          authorized = ctx.authorizeWorkspaceTools
            ? await ctx.authorizeWorkspaceTools(workspaceId, required)
            : Boolean(withoutPermission) &&
              !required.some((item) => withoutPermission!(item));
        } catch {
          authorized = false;
        }
      }
      if (authorized) allowed.add(name);
    }
    // Never publish a catalog authorized for a context that changed meanwhile.
    if (workspaceId !== getWorkspaceContextWorkspaceId(ctx)) {
      return { toolChoice: 'none' as const, activeTools: [] };
    }
    const selected = new Set(policy.activeTools);
    const canDiscover = selected.has('search_tools');
    const activeTools = [...allowed].filter(
      (name) => canDiscover || selected.has(name)
    );
    // prepareStep supports eligibility overrides, not replacement ToolSets.
    // These definitions belong only to this generation, never to the registry.
    for (const [name, definition] of Object.entries(tools)) {
      if (name !== 'search_tools') {
        tools[name] = { ...definition, deferLoading: !selected.has(name) };
      }
    }
    return { ...policy, activeTools };
  }
  return { tools, prepareStep };
}
