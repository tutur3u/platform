import type { ToolSet } from 'ai';
import { createGoogleSearchToolSet } from '../../tools/google-search-tool';

/** Mira search must retain its executor and grounding validation boundary. */
export function resolveChatTools(miraTools?: ToolSet | null): ToolSet {
  return miraTools ?? createGoogleSearchToolSet();
}
