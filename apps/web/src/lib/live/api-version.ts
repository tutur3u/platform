/**
 * Ephemeral tokens and the constrained Gemini Live websocket must use the same
 * API version. Keep this centralized so server token provisioning and the
 * browser connection cannot drift apart.
 */
export const GEMINI_LIVE_API_VERSION = 'v1beta';
