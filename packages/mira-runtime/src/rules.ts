import { isQuietTime, type QuietHours } from './quiet-hours';
import type { MiraInboundEvent } from './types';

/**
 * Reply policy. Rules resolve by precedence chat > person > channel > tenant;
 * the first scope that sets a field wins.
 */
export type ReplyRule = 'reply' | 'mute' | 'escalate';

export interface RuleLayer {
  reply?: ReplyRule;
  /** Tag the owner on replies in this scope. */
  tagOwner?: boolean;
}

export interface OwnerInstructionRule {
  /** Provider sender ids of the owner on this channel account. */
  ownerSenderIds: readonly string[];
  /** Unix ms; the rule is ignored at and after this time. */
  expiresAtMs: number;
}

export interface ReplyPolicy {
  /** Acknowledge every message that addresses Mira. Default true. */
  neverSilent: boolean;
  quietHours: QuietHours | null;
  tenant: RuleLayer;
  channel?: RuleLayer;
  person?: RuleLayer;
  chat?: RuleLayer & {
    /** Untagged owner instructions in this group are treated as requests. */
    ownerInstructions?: OwnerInstructionRule;
    /** Triage unaddressed group messages for watch rules. */
    watch?: boolean;
  };
}

export type ReplyDecision =
  | {
      action: 'respond';
      style: 'normal' | 'brief';
      escalate: boolean;
      tagOwner: boolean;
      reason: 'direct' | 'addressed';
    }
  | { action: 'acknowledge'; reason: 'muted_but_addressed' }
  | { action: 'triage'; reason: 'owner_instruction' | 'watch' }
  | { action: 'ignore'; reason: 'muted' | 'not_addressed' };

function resolve<K extends keyof RuleLayer>(
  policy: ReplyPolicy,
  key: K
): RuleLayer[K] {
  for (const layer of [
    policy.chat,
    policy.person,
    policy.channel,
    policy.tenant,
  ]) {
    if (layer && layer[key] !== undefined) return layer[key];
  }
  return undefined;
}

/** Invalid quiet-hours config must never make Mira silent. */
function quietStyle(
  quiet: QuietHours | null,
  nowMs: number
): 'brief' | 'normal' {
  try {
    return isQuietTime(quiet, nowMs) ? 'brief' : 'normal';
  } catch {
    return 'normal';
  }
}

export function decideReply(args: {
  event: MiraInboundEvent;
  policy: ReplyPolicy;
  nowMs: number;
}): ReplyDecision {
  const { event, policy, nowMs } = args;
  const addressed = event.conversationType === 'direct' || event.addressesMira;
  const rule = resolve(policy, 'reply') ?? 'reply';
  const tagOwner = resolve(policy, 'tagOwner') ?? false;
  // Quiet hours shorten replies; they never skip them.
  const style = quietStyle(policy.quietHours, nowMs);

  if (addressed) {
    if (rule === 'mute') {
      return policy.neverSilent
        ? { action: 'acknowledge', reason: 'muted_but_addressed' }
        : { action: 'ignore', reason: 'muted' };
    }
    return {
      action: 'respond',
      style,
      escalate: rule === 'escalate',
      tagOwner,
      reason: event.conversationType === 'direct' ? 'direct' : 'addressed',
    };
  }

  const owner = policy.chat?.ownerInstructions;
  if (
    owner &&
    nowMs < owner.expiresAtMs &&
    owner.ownerSenderIds.includes(event.senderId)
  ) {
    return { action: 'triage', reason: 'owner_instruction' };
  }
  if (policy.chat?.watch && rule !== 'mute') {
    return { action: 'triage', reason: 'watch' };
  }
  return {
    action: 'ignore',
    reason: rule === 'mute' ? 'muted' : 'not_addressed',
  };
}
