import type { LanguageModel } from 'ai';
import type { NextRequest } from 'next/server';
import type { AiRouteAuthResult } from './route-auth';

export type ChatRouteOptions = {
  serverAPIKeyFallback?: boolean;
  /** Trusted in-process instructions; never read from the request body. */
  serverSystemInstructions?: string;
  /** Direct user-funded chat. It bypasses gateway memory, credits, and provider tools. */
  subscription?: {
    resolveModel: (
      userId: string,
      model: string | undefined
    ) => Promise<LanguageModel>;
    onError: () => string;
    errorResponse?: (error: unknown) => {
      message: string;
      status: number;
      code: string;
    };
  };
  /** Gateway provider prefix for bare model names (e.g., 'openai', 'anthropic', 'vertex'). Defaults to 'google'. */
  defaultProvider?: string;
  requireWorkspaceId?: boolean;
  resolveAuth?: (request: NextRequest) => Promise<AiRouteAuthResult | null>;
};
