/**
 * Caller allowlist. Each service binding targets one named entrypoint, and
 * the entrypoint, not anything the caller sends, selects what it may do:
 * - `put`: which credential names it may write;
 * - `reveal`: which names it may decrypt, and for which purpose;
 * - `keyStatus`: whether it may read key metadata.
 */

export type CallerId = 'admin' | 'key-status' | 'storage' | 'web';

export type { WorkspaceSecretRevealPurpose as RevealPurpose } from '@tuturuuu/utils/workspace-secrets/protocol';
import type { WorkspaceSecretRevealPurpose as RevealPurpose } from '@tuturuuu/utils/workspace-secrets/protocol';

type NameMatcher = (name: string) => boolean;

const exact =
  (...names: string[]): NameMatcher =>
  (name) =>
    names.includes(name);

const STORAGE_NAMES = exact(
  'DRIVE_R2_ACCESS_KEY_ID',
  'DRIVE_R2_SECRET_ACCESS_KEY',
  'DRIVE_AUTO_EXTRACT_PROXY_TOKEN'
);

const AI_AGENT_NAMES: NameMatcher = (name) =>
  name === 'AI_AGENT_CHAT_SDK_STATE_REDIS_URL' ||
  /^AI_AGENT_REGISTRY:[^:]+:channel:[^:]+:secret:[^:]+$/u.test(name);

interface CallerPolicy {
  /** Names the caller may write; the database still refuses config names. */
  put: NameMatcher;
  reveal: Partial<Record<RevealPurpose, NameMatcher>>;
  keyStatus: boolean;
}

const ANY_CREDENTIAL: NameMatcher = () => true;
const NOTHING: NameMatcher = () => false;

export const CALLER_POLICIES: Readonly<Record<CallerId, CallerPolicy>> = {
  // apps/web vinext families: generic Secrets routes, storage and AI agents.
  web: {
    keyStatus: true,
    put: ANY_CREDENTIAL,
    reveal: { 'ai-agents': AI_AGENT_NAMES, storage: STORAGE_NAMES },
  },
  // tuturuuu-infrastructure (apps/admin).
  admin: {
    keyStatus: true,
    put: ANY_CREDENTIAL,
    reveal: {
      'ai-agents': AI_AGENT_NAMES,
      'discord-watcher': exact('AI_AGENT_DISCORD_GATEWAY_WATCHER_SECRET'),
      'mobile-calendar': exact('mobile_calendar_gateway:v1'),
      storage: STORAGE_NAMES,
    },
  },
  // Satellites that only read storage credentials through storage-core.
  storage: {
    keyStatus: false,
    put: NOTHING,
    reveal: { storage: STORAGE_NAMES },
  },
  // Live and room voice ticks: key metadata only.
  'key-status': {
    keyStatus: true,
    put: NOTHING,
    reveal: {},
  },
};

export function canPut(caller: CallerId, name: string) {
  return CALLER_POLICIES[caller].put(name);
}

export function canReveal(
  caller: CallerId,
  name: string,
  purpose: RevealPurpose
) {
  const matcher = CALLER_POLICIES[caller].reveal[purpose];
  return matcher ? matcher(name) : false;
}

export function canReadKeyStatus(caller: CallerId) {
  return CALLER_POLICIES[caller].keyStatus;
}
