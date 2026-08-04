/**
 * Ephemeral tokens and the constrained Gemini Live websocket must use the same
 * API version. Ephemeral tokens are currently supported only by v1alpha. Keep
 * this centralized so server provisioning and the browser cannot drift apart.
 */
export const GEMINI_LIVE_API_VERSION = 'v1alpha';
