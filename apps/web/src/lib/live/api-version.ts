/**
 * Ephemeral tokens and the constrained Gemini Live websocket must use the same
 * API version. Gemini's current ephemeral-token flow uses v1beta. Keep this
 * centralized so server provisioning and the browser cannot drift apart.
 */
export const GEMINI_LIVE_API_VERSION = 'v1beta';
