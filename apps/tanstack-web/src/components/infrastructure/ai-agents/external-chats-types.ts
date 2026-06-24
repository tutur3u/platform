import type { AiAgentDefinition } from '@tuturuuu/internal-api/infrastructure/ai';

export type ChannelLookup = Map<
  string,
  {
    agent: AiAgentDefinition;
    channel: AiAgentDefinition['channels'][number];
  }
>;
