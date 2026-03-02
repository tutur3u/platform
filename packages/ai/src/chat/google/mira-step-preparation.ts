import { DEV_MODE } from '@tuturuuu/utils/constants';
import {
  buildActiveToolsFromSelected,
  countRenderUiAttemptsInSteps,
  extractSelectedToolsFromSteps,
  hasRenderableRenderUiInSteps,
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

export function prepareMiraToolStep({
  steps,
  forceGoogleSearch,
  forceRenderUi,
  needsWorkspaceContextResolution,
  needsWorkspaceMembersTool,
  preferMarkdownTables,
}: PrepareMiraToolStepInput): {
  toolChoice?: 'required';
  activeTools: string[];
} {
  if (steps.length === 0) {
    return {
      toolChoice: 'required',
      activeTools: ['select_tools'],
    };
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
  const toolsForBuild = renderUiExhausted
    ? normalizedSelectedTools.filter((t) => t !== 'render_ui')
    : normalizedSelectedTools;

  if (
    needsWorkspaceContextResolution &&
    !hasToolCallInSteps(steps, 'set_workspace_context')
  ) {
    const hasListedAccessibleWorkspaces = hasToolCallInSteps(
      steps,
      'list_accessible_workspaces'
    );

    return {
      toolChoice: 'required',
      activeTools: hasListedAccessibleWorkspaces
        ? ['get_workspace_context', 'set_workspace_context', 'select_tools']
        : [
            'list_accessible_workspaces',
            'get_workspace_context',
            'set_workspace_context',
            'select_tools',
          ],
    };
  }

  if (
    needsWorkspaceMembersTool &&
    !hasToolCallInSteps(steps, 'list_workspace_members')
  ) {
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

    return {
      toolChoice: 'required',
      activeTools: Array.from(new Set(active)),
    };
  }

  if (forceGoogleSearch && !hasToolCallInSteps(steps, 'google_search')) {
    const active = buildActiveToolsFromSelected(toolsForBuild)
      .filter((toolName) => toolName !== 'no_action_needed')
      .concat('google_search', 'select_tools');

    return {
      toolChoice: 'required',
      activeTools: Array.from(new Set(active)),
    };
  }

  if (
    DEV_MODE &&
    forceRenderUi &&
    !preferMarkdownTables &&
    !hasRenderableRenderUiInSteps(steps) &&
    !renderUiExhausted
  ) {
    const active = [
      ...normalizedSelectedTools.filter(
        (toolName) =>
          toolName !== 'select_tools' && toolName !== 'no_action_needed'
      ),
      'render_ui',
      'select_tools',
    ];

    return {
      toolChoice: 'required',
      activeTools: Array.from(new Set(active)),
    };
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
    return {
      toolChoice: 'required',
      activeTools: Array.from(new Set(active)),
    };
  }

  if (hasRenderableRenderUiInSteps(steps)) {
    const active = buildActiveToolsFromSelected(toolsForBuild)
      .filter((toolName) => toolName !== 'render_ui')
      .concat('select_tools');
    return {
      activeTools: Array.from(new Set(active)),
    };
  }

  return {
    activeTools: buildActiveToolsFromSelected(toolsForBuild),
  };
}
