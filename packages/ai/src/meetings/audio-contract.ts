/** Keep database reservations at one per ten-second upload window. */
export const MEET_AUDIO_BATCH_INTERVAL_MS = 10_000;
export const MEET_AUDIO_BATCH_MAX_CLIPS = 48;
// Base64 plus prompts stays below the provider's 20 MB inline-audio request bound.
export const MEET_AUDIO_BATCH_MAX_BYTES = 12_000_000;
export const MEET_AUDIO_REQUEST_MAX_BYTES = 12_100_000;
export const MEET_AUDIO_PENDING_MAX_BYTES = 48_000_000;
export const MEET_AUDIO_SESSION_MAX_BATCHES = 1080;
