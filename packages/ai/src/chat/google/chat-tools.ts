import type { ToolSet } from 'ai';
import { createGoogleSearchToolSet } from '../../tools/google-search-tool';

/** Mira search must retain its executor and grounding validation boundary. */
export function resolveChatTools(
  miraTools?: ToolSet | null,
  options?: { allowNativeSearch?: boolean }
): ToolSet | undefined {
  if (miraTools) return miraTools;
  if (options?.allowNativeSearch === false) return undefined;
  return createGoogleSearchToolSet();
}
