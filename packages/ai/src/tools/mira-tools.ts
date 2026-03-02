import type { PermissionId } from '@tuturuuu/types';
import { DEV_MODE } from '@tuturuuu/utils/constants';
import type { Tool, ToolSet } from 'ai';
import { createStreamRenderUiTool } from './definitions/render-ui';
import { miraToolDefinitions } from './mira-tool-definitions';
import { executeMiraTool } from './mira-tool-dispatcher';
import {
  MIRA_TOOL_DIRECTORY,
  MIRA_TOOL_PERMISSIONS,
} from './mira-tool-metadata';
import type { MiraToolName } from './mira-tool-names';
import {
  buildRenderUiFailsafeSpec,
  isRenderableRenderUiSpec,
} from './mira-tool-render-ui';
import type { MiraToolContext } from './mira-tool-types';

export {
  MIRA_TOOL_DIRECTORY,
  MIRA_TOOL_PERMISSIONS,
  miraToolDefinitions,
  executeMiraTool,
};
export type { MiraToolContext } from './mira-tool-types';
export type { MiraToolName };

export function createMiraStreamTools(
  ctx: MiraToolContext,
  withoutPermission?: (p: PermissionId) => boolean,
  getSteps?: () => unknown[]
): ToolSet {
  const tools: ToolSet = {};
  let renderUiInvalidAttempts = 0;

  // Create a per-stream render_ui tool with stateful preprocessor.
  // The preprocessor auto-populates a context-aware fallback on the first
  // empty-elements call using data tools found in previous steps.
  const { toolDef: streamRenderUiDef, wasAutoPopulated } =
    createStreamRenderUiTool(getSteps);

  const definitionEntries = Object.entries(miraToolDefinitions) as Array<
    [
      keyof typeof miraToolDefinitions,
      (typeof miraToolDefinitions)[keyof typeof miraToolDefinitions],
    ]
  >;

  for (const [name, def] of definitionEntries) {
    const requiredPerm = MIRA_TOOL_PERMISSIONS[name];
    let isMissingPermission = false;
    let missingPermissionsStr = '';

    if (requiredPerm && withoutPermission) {
      if (Array.isArray(requiredPerm)) {
        const missing = requiredPerm.filter((p) => withoutPermission(p));
        if (missing.length > 0) {
          isMissingPermission = true;
          missingPermissionsStr = missing.join(', ');
        }
      } else if (withoutPermission(requiredPerm)) {
        isMissingPermission = true;
        missingPermissionsStr = requiredPerm;
      }
    }

    if (isMissingPermission) {
      tools[name] = {
        ...def,
        execute: async () => ({
          ok: false,
          error: `You do not have the required permissions to use this tool. Missing permission(s): ${missingPermissionsStr}. Please inform the user.`,
        }),
      } as Tool;
      continue;
    }

    if (name === 'render_ui') {
      if (!DEV_MODE) {
        continue; // Skip adding render_ui in non-DEV_MODE
      }

      tools[name] = {
        // Use the per-stream definition (stateful preprocessor + refinement)
        // instead of the shared singleton definition.
        ...streamRenderUiDef,
        execute: async (args: Record<string, unknown>) => {
          // Check if the preprocessor auto-populated this spec (the model
          // sent empty elements repeatedly and we injected a placeholder).
          if (wasAutoPopulated()) {
            return {
              spec: args,
              autoPopulatedFallback: true,
              autoRecoveredFromInvalidSpec: true,
              forcedFromRecoveryLoop: true,
              warning:
                'render_ui was auto-recovered from empty elements. A context-aware fallback was injected based on previously-called data tools.',
            };
          }

          if (isRenderableRenderUiSpec(args)) {
            renderUiInvalidAttempts = 0;
            return { spec: args };
          }

          // If we reach here, the spec passed Zod validation but still
          // fails our stricter isRenderableRenderUiSpec check (e.g. root key
          // not matching an element, or root element is not an object).
          renderUiInvalidAttempts += 1;
          const isRepeatedInvalidAttempt = renderUiInvalidAttempts > 1;

          // Build a targeted diagnosis of what went wrong.
          const diagnosisParts: string[] = [];
          if (typeof args.root !== 'string' || args.root.length === 0) {
            diagnosisParts.push('`root` is missing or not a string');
          }
          const elements = args.elements;
          if (
            !elements ||
            typeof elements !== 'object' ||
            Array.isArray(elements)
          ) {
            diagnosisParts.push('`elements` is missing or not an object');
          } else if (Object.keys(elements as object).length === 0) {
            diagnosisParts.push(
              '`elements` is empty — you must define at least elements[root]'
            );
          } else if (
            typeof args.root === 'string' &&
            !(args.root in (elements as Record<string, unknown>))
          ) {
            diagnosisParts.push(
              `elements["${args.root}"] does not exist — the root element ID must be a key in elements`
            );
          }
          const diagnosis =
            diagnosisParts.length > 0
              ? ` Diagnosis: ${diagnosisParts.join('; ')}.`
              : '';

          const stopMessage = isRepeatedInvalidAttempt
            ? ' STOP retrying render_ui. Respond with plain text/markdown instead.'
            : ` Fix: elements MUST contain the root element. Minimal working example: { "root": "r", "elements": { "r": { "type": "Card", "props": { "title": "Result" }, "children": ["t"] }, "t": { "type": "Text", "props": { "content": "Your content here" }, "children": [] } } }. Retry ONE more time with populated elements.`;

          return {
            spec: buildRenderUiFailsafeSpec(args),
            autoRecoveredFromInvalidSpec: true,
            ...(isRepeatedInvalidAttempt
              ? { forcedFromRecoveryLoop: true }
              : {}),
            warning: `Invalid render_ui spec.${diagnosis}${stopMessage}`,
          };
        },
      } as Tool;
      continue;
    }

    tools[name] = {
      ...def,
      execute: async (args: Record<string, unknown>) =>
        executeMiraTool(name, args, ctx),
    } as Tool;
  }

  return tools;
}
