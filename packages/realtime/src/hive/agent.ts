export type HiveDestructiveWorldAction = 'clear' | 'reseed';

const HIVE_AGENT_CLEAR_WORDS = ['blank', 'clear', 'empty'] as const;
const HIVE_AGENT_RESEED_WORDS = ['default', 'reseed', 'reset'] as const;
const HIVE_ADMIN_WORLD_EVENT_TYPES = new Set(['world.clear', 'world.reseed']);

function hasAny(text: string, words: readonly string[]) {
  return words.some((word) => text.includes(word));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function getHiveAgentDestructiveWorldAction(
  prompt: unknown
): HiveDestructiveWorldAction | null {
  if (typeof prompt !== 'string') {
    return null;
  }

  const text = prompt.trim().toLowerCase();

  if (!text) {
    return null;
  }

  if (hasAny(text, HIVE_AGENT_CLEAR_WORDS)) {
    return 'clear';
  }

  if (hasAny(text, HIVE_AGENT_RESEED_WORDS)) {
    return 'reseed';
  }

  return null;
}

export function isHiveAdminWorldEvent(eventType: string, payload: unknown) {
  if (HIVE_ADMIN_WORLD_EVENT_TYPES.has(eventType)) {
    return true;
  }

  if (eventType !== 'agent.refine' || !isRecord(payload)) {
    return false;
  }

  return getHiveAgentDestructiveWorldAction(payload.prompt) !== null;
}
