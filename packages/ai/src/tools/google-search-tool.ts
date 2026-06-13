import { google } from '@ai-sdk/google';
import type { ToolSet } from 'ai';

export function createGoogleSearchToolSet(): ToolSet {
  return {
    // Google executes this provider tool itself; AI SDK's public ToolSet type
    // still narrows provider tools through the local-tool generic union.
    google_search: google.tools.googleSearch<never>(
      {}
    ) as unknown as ToolSet[string],
  };
}
