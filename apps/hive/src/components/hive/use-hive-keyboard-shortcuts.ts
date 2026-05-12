'use client';

import { useEffect } from 'react';
import { objectCatalog, terrainCatalog } from '@/engine/catalog';
import type { HiveBuildMode, HiveTool } from '@/engine/types';

type UseHiveKeyboardShortcutsProps = {
  onRotateSelection: () => void;
  setActiveBuildMode: (mode: HiveBuildMode) => void;
  setActiveObject: (id: string) => void;
  setActiveTerrain: (id: string) => void;
  setTool: (tool: HiveTool) => void;
};

export function useHiveKeyboardShortcuts({
  onRotateSelection,
  setActiveBuildMode,
  setActiveObject,
  setActiveTerrain,
  setTool,
}: UseHiveKeyboardShortcutsProps) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable
      ) {
        return;
      }

      const key = event.key.toLowerCase();
      const terrain = terrainCatalog.find(
        (item) => item.shortcut?.toLowerCase() === key
      );
      if (terrain) {
        setActiveTerrain(terrain.id);
        setActiveBuildMode('terrain');
        setTool('build');
        return;
      }

      const object = objectCatalog.find(
        (item) => item.shortcut?.toLowerCase() === key
      );
      if (object) {
        setActiveObject(object.id);
        setActiveBuildMode('object');
        setTool('build');
        return;
      }

      if (key === 'v') setTool('select');
      if (key === 'b') setTool('build');
      if (key === 'e') setTool('erase');
      if (key === 'm') setTool('move');
      if (key === 'n') {
        setActiveBuildMode('npc');
        setTool('build');
      }
      if (key === 'r') {
        onRotateSelection();
        setTool('rotate');
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    onRotateSelection,
    setActiveBuildMode,
    setActiveObject,
    setActiveTerrain,
    setTool,
  ]);
}
