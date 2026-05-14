'use client';

import type { Dispatch, SetStateAction } from 'react';
import { applyHiveAgentInstruction } from '@/engine/agent';
import type {
  HiveBuildMode,
  HiveNpc,
  HiveSelection,
  HiveTool,
  HiveVector3,
  HiveWorldData,
} from '@/engine/types';
import {
  addObject,
  createDefaultWorld,
  createEmptyWorld,
  moveObject,
  removeSelection,
  rotateObject,
  updateBlock,
  updateObject,
  upsertBlock,
} from '@/engine/world';
import type { useHiveMutations } from '@/hooks/use-hive-data';
import { createDefaultNpcPayload } from './hive-npc-defaults';
import { useHiveKeyboardShortcuts } from './use-hive-keyboard-shortcuts';
import type { createWorldEventPersistence } from './use-world-event-persistence';

type UseHiveEditorActionsProps = {
  activeObject: string;
  activeTerrain: string;
  mutations: ReturnType<typeof useHiveMutations>;
  npcs: HiveNpc[];
  persistWorld: ReturnType<typeof createWorldEventPersistence>;
  revision: number;
  selection: HiveSelection;
  serverId: string | null;
  setActiveBuildMode: (mode: HiveBuildMode) => void;
  setActiveObject: (id: string) => void;
  setActiveTerrain: (id: string) => void;
  setNpcs: Dispatch<SetStateAction<HiveNpc[]>>;
  setSelection: (selection: HiveSelection) => void;
  setSyncNotice: (notice: string | null) => void;
  setTool: (tool: HiveTool) => void;
  world: HiveWorldData;
};

export function useHiveEditorActions({
  activeObject,
  activeTerrain,
  mutations,
  npcs,
  persistWorld,
  revision,
  selection,
  serverId,
  setActiveBuildMode,
  setActiveObject,
  setActiveTerrain,
  setNpcs,
  setSelection,
  setSyncNotice,
  setTool,
  world,
}: UseHiveEditorActionsProps) {
  const placeTerrain = (position: HiveVector3) => {
    persistWorld(
      upsertBlock(world, position, activeTerrain),
      'block.place',
      {
        blockType: activeTerrain,
        position,
      },
      {
        rebase: (latestWorld) =>
          upsertBlock(latestWorld, position, activeTerrain),
      }
    );
  };

  const placeObject = (position: HiveVector3) => {
    const nextWorld = addObject(world, position, activeObject);
    if (nextWorld === world) {
      setSyncNotice('That object cannot be placed on this tile.');
      return;
    }
    persistWorld(
      nextWorld,
      'object.place',
      {
        objectType: activeObject,
        position,
      },
      {
        rebase: (latestWorld) => addObject(latestWorld, position, activeObject),
      }
    );
  };

  const placeNpc = (position: HiveVector3) => {
    if (!serverId) return;
    mutations.createNpc.mutate(
      createDefaultNpcPayload(position, npcs.length + 1)
    );
  };

  const eraseSelection = (target: NonNullable<HiveSelection>) => {
    const result = removeSelection(world, npcs, target);
    setSelection(null);

    if (target.kind === 'npc') {
      setNpcs(result.npcs);
      mutations.deleteNpc.mutate(target.id);
      return;
    }

    persistWorld(
      result.world,
      `${target.kind}.remove`,
      {
        erasedId: target.id,
        erasedKind: target.kind,
      },
      {
        rebase: (latestWorld) =>
          removeSelection(latestWorld, npcs, target).world,
      }
    );
  };

  const moveSelection = (position: HiveVector3) => {
    if (!selection) return;

    if (selection.kind === 'object') {
      const nextWorld = moveObject(world, selection.id, position);
      if (nextWorld !== world) {
        persistWorld(
          nextWorld,
          'object.move',
          {
            movedId: selection.id,
            position,
          },
          {
            rebase: (latestWorld) =>
              moveObject(latestWorld, selection.id, position),
          }
        );
      }
      return;
    }

    if (selection.kind === 'npc') {
      setNpcs((items) =>
        items.map((npc) =>
          npc.id === selection.id ? { ...npc, position } : npc
        )
      );
      mutations.updateNpc.mutate({
        npcId: selection.id,
        payload: { position },
      });
    }
  };

  const rotateSelection = () => {
    if (!selection || selection.kind !== 'object') return;
    persistWorld(
      rotateObject(world, selection.id),
      'object.update',
      {
        rotatedId: selection.id,
      },
      {
        rebase: (latestWorld) => rotateObject(latestWorld, selection.id),
      }
    );
  };

  useHiveKeyboardShortcuts({
    onRotateSelection: rotateSelection,
    setActiveBuildMode,
    setActiveObject,
    setActiveTerrain,
    setTool,
  });

  const patchNpc = (id: string, patch: Partial<HiveNpc>) => {
    setNpcs((items) =>
      items.map((npc) => (npc.id === id ? { ...npc, ...patch } : npc))
    );
    mutations.updateNpc.mutate({ npcId: id, payload: patch });
  };

  const patchBlock = (id: string, patch: Parameters<typeof updateBlock>[2]) => {
    const nextWorld = updateBlock(world, id, patch);
    if (nextWorld === world) {
      setSyncNotice('That block transform is blocked by another tile.');
      return;
    }

    const nextBlock =
      nextWorld.blocks.find((block) => block.id === id) ??
      nextWorld.blocks.find(
        (block) =>
          patch.position &&
          block.position.x === Math.round(patch.position.x) &&
          block.position.y === Math.max(0, Math.round(patch.position.y)) &&
          block.position.z === Math.round(patch.position.z)
      );

    if (nextBlock) {
      setSelection({ id: nextBlock.id, kind: 'block' });
    }

    persistWorld(
      nextWorld,
      'block.update',
      {
        blockId: id,
        patch,
      },
      {
        rebase: (latestWorld) => updateBlock(latestWorld, id, patch),
      }
    );
  };

  const patchObject = (
    id: string,
    patch: Parameters<typeof updateObject>[2]
  ) => {
    const nextWorld = updateObject(world, id, patch);
    if (nextWorld === world) {
      setSyncNotice('That object transform overlaps another footprint.');
      return;
    }

    persistWorld(
      nextWorld,
      'object.update',
      {
        objectId: id,
        patch,
      },
      {
        rebase: (latestWorld) => updateObject(latestWorld, id, patch),
      }
    );
  };

  const runNpc = (
    npcId: string,
    promptMode: 'custom' | 'default' | 'enhanced'
  ) => {
    mutations.runNpc.mutate({
      npcId,
      payload: { expectedRevision: revision, promptMode, world },
    });
  };

  const resetWorld = (mode: 'clear' | 'reseed') => {
    const nextWorld =
      mode === 'clear' ? createEmptyWorld() : createDefaultWorld();
    setSelection(null);
    persistWorld(
      nextWorld,
      `world.${mode}`,
      { mode },
      { rebase: () => nextWorld }
    );
  };

  const applyAgentInstruction = (prompt: string) => {
    if (!serverId) {
      return {
        actions: [],
        changed: false,
        summary: 'Select a Hive server before asking the agent to edit.',
        world,
      };
    }

    const result = applyHiveAgentInstruction(world, prompt);
    if (!result.changed) {
      setSyncNotice(result.summary);
      return result;
    }

    persistWorld(
      result.world,
      'agent.refine',
      {
        actions: result.actions,
        prompt,
      },
      {
        rebase: (latestWorld) =>
          applyHiveAgentInstruction(latestWorld, prompt).world,
      }
    );
    setSelection(null);
    setTool('select');
    return result;
  };

  return {
    applyAgentInstruction,
    eraseSelection,
    moveSelection,
    patchBlock,
    patchNpc,
    patchObject,
    placeNpc,
    placeObject,
    placeTerrain,
    resetWorld,
    rotateSelection,
    runNpc,
  };
}
