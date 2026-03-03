import { DEV_MODE } from '@tuturuuu/utils/constants';
import {
  buildActiveToolsFromSelected,
  countRenderUiAttemptsInSteps,
  extractSelectedToolsFromSteps,
  getToolsBlockedByConsecutiveFailures,
  hasReachedMiraToolCallLimit,
  hasRenderableRenderUiInSteps,
  hasSuccessfulWorkspaceContextResolutionInSteps,
  hasToolCallInSteps,
  wasToolEverSelectedInSteps,
} from '../mira-render-ui-policy';

export type PrepareMiraToolStepInput = {
  steps: unknown[];
  forceGoogleSearch: boolean;
  forceRenderUi: boolean;
  needsWorkspaceContextResolution: boolean;
  needsWorkspaceMembersTool: boolean;
  preferMarkdownTables: boolean;
};

type PrepareMiraToolChoice =
  | 'none'
  | 'required'
  | { toolName: string; type: 'tool' };

type PrepareMiraToolStepResult = {
  toolChoice?: PrepareMiraToolChoice;
  activeTools: string[];
  forcePlainTextResponse?: boolean;
};

export function prepareMiraToolStep({
  steps,
  forceGoogleSearch,
  forceRenderUi,
  needsWorkspaceContextResolution,
  needsWorkspaceMembersTool,
  preferMarkdownTables,
}: PrepareMiraToolStepInput): PrepareMiraToolStepResult {
  const blockedTools = new Set(getToolsBlockedByConsecutiveFailures(steps));

  const filterBlockedTools = (toolNames: string[]) =>
    toolNames.filter((toolName) => !blockedTools.has(toolName));
  const finalizeActiveTools = (
    activeTools: string[],
    toolChoice?: PrepareMiraToolChoice
  ): PrepareMiraToolStepResult => {
    const uniqueActiveTools = Array.from(new Set(activeTools));
    const hasActionableTool = uniqueActiveTools.some(
      (toolName) =>
        toolName !== 'select_tools' && toolName !== 'no_action_needed'
    );

    if (!hasActionableTool && steps.length > 0) {
      const shouldStopForNoActionNeeded =
        uniqueActiveTools.includes('no_action_needed') &&
        wasToolEverSelectedInSteps(steps, 'no_action_needed');

      if (shouldStopForNoActionNeeded) {
        return {
          activeTools: [],
          forcePlainTextResponse: true,
          toolChoice: 'none',
        };
      }

      return { activeTools: [] };
    }

    return toolChoice
      ? { toolChoice, activeTools: uniqueActiveTools }
      : { activeTools: uniqueActiveTools };
  };

  if (steps.length === 0) {
    return {
      toolChoice: 'required',
      activeTools: ['select_tools'],
    };
  }

  if (hasReachedMiraToolCallLimit(steps)) {
    return { activeTools: [] };
  }

  const selectedTools = extractSelectedToolsFromSteps(steps);
  const MAX_RENDER_UI_ATTEMPTS = 2;
  const renderUiAttempts = countRenderUiAttemptsInSteps(steps);
  const renderUiExhausted = renderUiAttempts >= MAX_RENDER_UI_ATTEMPTS;
  const filterRenderUiForMarkdownTables =
    preferMarkdownTables && !forceRenderUi;
  const filterSearchForMarkdownTables =
    preferMarkdownTables && !forceGoogleSearch;
  const normalizedSelectedTools = selectedTools.filter(
    (toolName) =>
      !(filterRenderUiForMarkdownTables && toolName === 'render_ui') &&
      !(filterSearchForMarkdownTables && toolName === 'google_search')
  );
  const availableSelectedTools = filterBlockedTools(normalizedSelectedTools);
  const toolsForBuild = renderUiExhausted
    ? availableSelectedTools.filter((t) => t !== 'render_ui')
    : availableSelectedTools;

  if (
    needsWorkspaceContextResolution &&
    !hasSuccessfulWorkspaceContextResolutionInSteps(steps)
  ) {
    if (blockedTools.has('set_workspace_context')) {
      return { activeTools: [] };
    }

    const hasListedAccessibleWorkspaces = hasToolCallInSteps(
      steps,
      'list_accessible_workspaces'
    );

    return finalizeActiveTools(
      filterBlockedTools(
        hasListedAccessibleWorkspaces
          ? ['get_workspace_context', 'set_workspace_context', 'select_tools']
          : [
              'list_accessible_workspaces',
              'get_workspace_context',
              'set_workspace_context',
              'select_tools',
            ]
      ),
      'required'
    );
  }

  if (
    needsWorkspaceMembersTool &&
    !hasToolCallInSteps(steps, 'list_workspace_members')
  ) {
    if (blockedTools.has('list_workspace_members')) {
      return { activeTools: [] };
    }

    const selected = buildActiveToolsFromSelected(toolsForBuild).filter(
      (toolName) =>
        toolName !== 'no_action_needed' &&
        toolName !== 'select_tools' &&
        toolName !== 'get_workspace_context' &&
        toolName !== 'list_workspace_members'
    );
    const active = [
      'get_workspace_context',
      'list_workspace_members',
      ...selected,
      'select_tools',
    ];

    return finalizeActiveTools(filterBlockedTools(active), 'required');
  }

  if (forceGoogleSearch && !hasToolCallInSteps(steps, 'google_search')) {
    if (blockedTools.has('google_search')) {
      return { activeTools: [] };
    }

    const active = buildActiveToolsFromSelected(toolsForBuild)
      .filter((toolName) => toolName !== 'no_action_needed')
      .concat('google_search', 'select_tools');

    return finalizeActiveTools(filterBlockedTools(active), 'required');
  }

  if (
    DEV_MODE &&
    forceRenderUi &&
    !preferMarkdownTables &&
    !hasRenderableRenderUiInSteps(steps) &&
    !renderUiExhausted
  ) {
    const active = [
      ...availableSelectedTools.filter(
        (toolName) =>
          toolName !== 'select_tools' && toolName !== 'no_action_needed'
      ),
      'render_ui',
      'select_tools',
    ];

    return finalizeActiveTools(filterBlockedTools(active), 'required');
  }

  const renderUiSelectedEver =
    normalizedSelectedTools.includes('render_ui') ||
    wasToolEverSelectedInSteps(steps, 'render_ui');
  if (
    DEV_MODE &&
    renderUiSelectedEver &&
    !preferMarkdownTables &&
    !hasRenderableRenderUiInSteps(steps) &&
    !renderUiExhausted
  ) {
    const active = buildActiveToolsFromSelected(toolsForBuild)
      .filter((toolName) => toolName !== 'no_action_needed')
      .concat('render_ui', 'select_tools');
    return finalizeActiveTools(filterBlockedTools(active), 'required');
  }

  if (hasRenderableRenderUiInSteps(steps)) {
    const active = buildActiveToolsFromSelected(toolsForBuild)
      .filter((toolName) => toolName !== 'render_ui')
      .concat('select_tools');
    return finalizeActiveTools(filterBlockedTools(active));
  }

  return finalizeActiveTools(
    filterBlockedTools(buildActiveToolsFromSelected(toolsForBuild))
  );
}
