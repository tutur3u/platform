'use client';

import type { UIMessage } from '@tuturuuu/ai/types';
import {
  manageWorkspaceSchema,
  showWorkspaceArtifactSchema,
} from '@tuturuuu/ai/workspace-artifacts';
import { SidebarContext } from '@tuturuuu/ui/custom/sidebar-context';
import { useTheme } from 'next-themes';
import { useCallback, useContext, useEffect, useRef } from 'react';
import { getMiraToolCallId, getMiraToolName } from './mira-tool-part-utils';
import { useMiraWorkspace } from './mira-workspace-state';

export function useMiraUiActions(messages: UIMessage[], status: string) {
  const applyAction = useMiraUiActionDispatcher();
  const handled = useRef(new Set<string>());
  const wasBusy = useRef(false);
  useEffect(() => {
    const busy = status === 'submitted' || status === 'streaming';
    const apply = busy || wasBusy.current;
    wasBusy.current = busy;
    for (const message of messages) {
      if (message.role !== 'assistant') continue;
      for (const [index, part] of message.parts.entries()) {
        const toolName = getMiraToolName(part);
        const key = `${message.id}:${getMiraToolCallId(part, index)}`;
        const result = part as {
          state?: string;
          output?: Record<string, unknown>;
        };
        if (result.state !== 'output-available' || handled.current.has(key))
          continue;
        handled.current.add(key);
        const output = result.output;
        // Restoring a conversation must never replay old UI commands.
        if (!apply || !output || output.success !== true || output.error)
          continue;
        applyAction(toolName, output);
      }
    }
  }, [messages, status, applyAction]);
}

export function useMiraUiActionDispatcher() {
  const { setTheme } = useTheme();
  const sidebar = useContext(SidebarContext);
  const workspace = useMiraWorkspace();
  return useCallback(
    (toolName: string, output: Record<string, unknown>) => {
      if (output.success !== true || output.error) return;
      if (
        toolName === 'set_theme' &&
        ['light', 'dark', 'system'].includes(String(output.theme))
      ) {
        setTheme(String(output.theme));
      } else if (
        toolName === 'set_sidebar' &&
        ['expanded', 'collapsed', 'hover', 'hidden'].includes(
          String(output.behavior)
        )
      ) {
        sidebar?.handleBehaviorChange(
          output.behavior as 'expanded' | 'collapsed' | 'hover' | 'hidden'
        );
      } else if (
        toolName === 'show_workspace_artifact' &&
        typeof output.wsId === 'string'
      ) {
        const parsed = showWorkspaceArtifactSchema.safeParse(output);
        if (!parsed.success) return;
        const { kind, layout, presentation } = parsed.data;
        const isNewArtifact =
          workspace &&
          !workspace.artifacts.some(
            (artifact) =>
              artifact.kind === kind && artifact.wsId === output.wsId
          );
        if (isNewArtifact && sidebar?.behavior === 'expanded') {
          sidebar.handleBehaviorChange('collapsed');
        }
        workspace?.open(kind, output.wsId, layout, presentation);
      } else if (
        toolName === 'manage_workspace' &&
        typeof output.wsId === 'string'
      ) {
        const parsed = manageWorkspaceSchema.safeParse(output);
        if (!parsed.success) return;
        const { operation, kind, layout } = parsed.data;
        if (operation === 'close_all') workspace?.closeAll();
        else if (operation === 'set_layout' && layout)
          workspace?.setLayout(layout);
        else if (operation === 'close_artifact' && kind)
          workspace?.close(kind, output.wsId);
        else if (operation === 'focus_artifact' && kind)
          workspace?.focus(kind, output.wsId);
      }
    },
    [setTheme, sidebar, workspace]
  );
}
