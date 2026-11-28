import {
  getAiStudioPublicModels,
  getAiStudioSavedKeyModels,
  runAiStudioPlayground,
  runAiStudioSavedKeyPlayground,
} from '@tuturuuu/internal-api/ai-studio';
import { runtimeAppBase } from '@tuturuuu/start-bridge/app-url';

type PlaygroundInput = Parameters<typeof runAiStudioPlayground>[1];

/**
 * The Playground calls this app's own routes with a plain `fetch`, so they must
 * stay on the serving origin and mount: `/v1/...` on the subdomain and
 * `/ai/v1/...` on `tuturuuu.com`. The shared client defaults the public API to
 * `ai.tuturuuu.com` (cross-origin from the mount), and an unprefixed `/api`
 * path on the apex reaches Web instead of this app.
 */
const options = () => ({ baseUrl: runtimeAppBase() });

export const playgroundPublicModels = (secret: string) =>
  getAiStudioPublicModels(secret, options());

export const playgroundSavedKeyModels = (workspaceId: string, keyId: string) =>
  getAiStudioSavedKeyModels(workspaceId, keyId, options());

export const playgroundRun = (secret: string, input: PlaygroundInput) =>
  runAiStudioPlayground(secret, input, options());

export const playgroundSavedKeyRun = (
  workspaceId: string,
  keyId: string,
  input: PlaygroundInput
) => runAiStudioSavedKeyPlayground(workspaceId, keyId, input, options());
