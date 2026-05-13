import type { HiveVector3 } from '@/engine/types';

export function createDefaultNpcPayload(position: HiveVector3, index: number) {
  return {
    backstory: 'A new participant in the Hive research settlement.',
    name: `NPC ${index}`,
    position,
    role: 'settlement observer',
    settings: {
      agentMode: 'llm',
      autonomous: false,
      decisionPolicy: 'manual',
    },
    systemPrompt:
      'Observe nearby voxel entities and decide one grounded action at a time.',
  };
}
