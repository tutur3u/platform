import { z } from 'zod';
import { tool } from '../core';
import { dashboardCatalog } from '../json-render-catalog';
import {
  createRenderUiPreprocessor,
  normalizeRenderUiInputForTool,
} from '../normalize-render-ui-input';

const RENDER_UI_DESCRIPTION =
  'Render interactive UI. CRITICAL: `elements` must contain at least one entry keyed by the `root` ID. ' +
  'Example: { "root": "r", "elements": { "r": { "type": "Card", "props": { "title": "Hello" }, "children": [] } } }. ' +
  'NEVER pass empty elements ({}). Every element needs type, props, children.';

/** Base catalog Zod schema with a refinement that rejects empty `elements`. */
const baseSchemaWithRefinement = dashboardCatalog.zodSchema().refine(
  (spec) => {
    if (
      spec &&
      typeof spec === 'object' &&
      'elements' in spec &&
      spec.elements &&
      typeof spec.elements === 'object'
    ) {
      return Object.keys(spec.elements as Record<string, unknown>).length > 0;
    }
    return true; // Let other validators handle non-object elements.
  },
  {
    message:
      'elements must not be empty. Define at least one element keyed by the root ID. ' +
      'Example: { "root": "r", "elements": { "r": { "type": "Card", "props": { "title": "Hello" }, "children": [] } } }',
    path: ['elements'],
  }
);

/**
 * Static tool definitions used for the shared tool registry.
 * Uses the basic normalizer (no per-stream state).
 */
export const renderUiToolDefinitions = {
  render_ui: tool({
    description: RENDER_UI_DESCRIPTION,
    inputSchema: z.preprocess(
      (val: unknown) => normalizeRenderUiInputForTool(val),
      baseSchemaWithRefinement
    ),
  }),
} as const;

/**
 * Create a render_ui tool definition with a per-stream stateful preprocessor.
 *
 * On the first empty-elements call, the preprocessor auto-populates a
 * context-aware fallback (using data tools found in previous steps) so
 * validation passes and the user sees something rather than a failure loop.
 *
 * @param getSteps – Optional callback returning the current steps array for
 *   context-aware fallback selection.
 *
 * Returns the tool definition and a `wasAutoPopulated()` check for the execute
 * handler to detect auto-populated specs.
 */
export function createStreamRenderUiTool(getSteps?: () => unknown[]) {
  const { preprocess, wasAutoPopulated } = createRenderUiPreprocessor(getSteps);

  const toolDef = tool({
    description: RENDER_UI_DESCRIPTION,
    inputSchema: z.preprocess(
      (val: unknown) => preprocess(val),
      baseSchemaWithRefinement
    ),
  });

  return { toolDef, wasAutoPopulated };
}
