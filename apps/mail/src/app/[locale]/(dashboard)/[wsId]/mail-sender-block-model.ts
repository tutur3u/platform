import type { MailSenderBlock } from '@tuturuuu/internal-api';
import {
  normalizeSenderBlock,
  SHARED_PROVIDER_DOMAINS,
  type SenderBlockRule,
  senderBlockCandidates,
} from '@/lib/mail/sender-blocks/match';

export type SenderBlockInput =
  | { status: 'empty' }
  | { status: 'invalid' }
  | { status: 'shared_provider'; domain: string }
  | { status: 'valid'; rule: SenderBlockRule };

/**
 * Reads the "Address or @domain" field: a local part before `@` names one
 * address; `@domain` or a bare domain names a domain.
 */
export function parseSenderBlockInput(raw: string): SenderBlockInput {
  const value = raw.trim().toLowerCase();
  if (!value) return { status: 'empty' };
  const kind = value.indexOf('@') > 0 ? 'address' : 'domain';
  const rule = normalizeSenderBlock(kind, value);
  if (rule) return { status: 'valid', rule };
  const domain = value.replace(/^@/u, '');
  if (kind === 'domain' && SHARED_PROVIDER_DOMAINS.has(domain))
    return { status: 'shared_provider', domain };
  return { status: 'invalid' };
}

/** How a block is written for people: the address, or `@domain`. */
export function senderBlockTarget(
  block: Pick<SenderBlockRule, 'kind' | 'value'>
) {
  return block.kind === 'domain' ? `@${block.value}` : block.value;
}

/**
 * The block that covers this sender, preferring the address over the
 * narrowest matching domain, or null when none applies.
 */
export function findSenderBlock<T extends SenderBlockRule>(
  address: string | null | undefined,
  blocks: readonly T[]
): T | null {
  for (const candidate of senderBlockCandidates(address)) {
    const block = blocks.find(
      (item) => item.kind === candidate.kind && item.value === candidate.value
    );
    if (block) return block;
  }
  return null;
}

/** First of several senders (such as thread participants) that is blocked. */
export function findBlockForSenders(
  addresses: readonly (string | null | undefined)[],
  blocks: readonly MailSenderBlock[]
) {
  for (const address of addresses) {
    const block = findSenderBlock(address, blocks);
    if (block) return block;
  }
  return null;
}
