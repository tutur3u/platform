import type { AiAgentDefinition } from '@tuturuuu/internal-api/infrastructure/ai';
import type { ChannelLookup } from './external-chats-types';

export function buildChannelLookup(agents: AiAgentDefinition[]) {
  const lookup: ChannelLookup = new Map();

  for (const agent of agents) {
    for (const channel of agent.channels) {
      lookup.set(`${agent.id}:${channel.id}`, { agent, channel });
    }
  }

  return lookup;
}

export function formatDateTime(value?: string | null) {
  if (!value) return '';

  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
  }).format(new Date(value));
}
