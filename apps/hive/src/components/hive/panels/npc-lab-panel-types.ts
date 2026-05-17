import type { Dispatch, SetStateAction } from 'react';
import type { HiveNpc, HiveWorldData } from '@/engine/types';
import type { HiveAiContextState } from '../use-hive-ai-context';

export type NpcLabInitialTab =
  | 'behavior'
  | 'brain'
  | 'identity'
  | 'interactions';

export type NpcDraft = {
  backstory: string;
  backstoryEnabled: boolean;
  customPromptEnabled: boolean;
  memoryEnabled: boolean;
  model: string;
  name: string;
  role: string;
  settings: HiveNpc['settings'];
  systemPrompt: string;
};

export type NpcLabTabsProps = {
  aiContext: HiveAiContextState;
  draft: NpcDraft;
  hasChanges: boolean;
  initialTab: NpcLabInitialTab;
  interactionPrompt: string;
  interactionTurns: number;
  isRunning: boolean;
  npc: HiveNpc;
  onPatchSettings: (settingsPatch: HiveNpc['settings']) => void;
  onResetDraft: () => void;
  onRun: (
    npcId: string,
    promptMode: 'custom' | 'default' | 'enhanced',
    options?: {
      maxTurns?: number;
      prompt?: string | null;
      targetNpcId?: string | null;
    }
  ) => void;
  onRunInteraction: (input: {
    maxTurns?: number;
    prompt?: string | null;
    sourceNpcId: string;
    targetNpcId: string;
  }) => void;
  onSaveDraft: () => void;
  setDraft: Dispatch<SetStateAction<NpcDraft | null>>;
  setInteractionPrompt: (prompt: string) => void;
  setInteractionTurns: (turns: number) => void;
  setTargetNpcId: (npcId: string | null) => void;
  targetNpcId: string | null;
  targetNpcs: HiveNpc[];
  world: HiveWorldData;
};

export function createNpcDraft(npc: HiveNpc): NpcDraft {
  return {
    backstory: npc.backstory,
    backstoryEnabled: npc.backstoryEnabled,
    customPromptEnabled: npc.customPromptEnabled,
    memoryEnabled: npc.memoryEnabled,
    model: npc.model,
    name: npc.name,
    role: npc.role,
    settings: npc.settings ?? {},
    systemPrompt: npc.systemPrompt,
  };
}
