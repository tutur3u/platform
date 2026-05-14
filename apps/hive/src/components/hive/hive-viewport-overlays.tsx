'use client';

import type { Dispatch, SetStateAction } from 'react';
import type {
  HiveNpc,
  HiveSelection,
  HiveServer,
  HiveWorldData,
} from '@/engine/types';
import { EditorChromeControls } from './editor-chrome-controls';
import {
  HiveAgentComposer,
  type HiveAgentMessage,
} from './hive-agent-composer';
import { HiveMiniMap } from './hive-mini-map';

type HiveViewportOverlaysProps = {
  agentMessages: HiveAgentMessage[];
  bottomCollapsed: boolean;
  chatOpen: boolean;
  miniMapCollapsed: boolean;
  npcs: HiveNpc[];
  onSetMiniMapCollapsed: Dispatch<SetStateAction<boolean>>;
  onSetTopCollapsed: Dispatch<SetStateAction<boolean>>;
  onSetBottomCollapsed: Dispatch<SetStateAction<boolean>>;
  onSubmitAgentPrompt: (prompt: string) => void;
  selectedServer?: HiveServer | null;
  selection: HiveSelection;
  syncNotice?: string | null;
  topCollapsed: boolean;
  world: HiveWorldData;
};

export function HiveViewportOverlays({
  agentMessages,
  bottomCollapsed,
  chatOpen,
  miniMapCollapsed,
  npcs,
  onSetBottomCollapsed,
  onSetMiniMapCollapsed,
  onSetTopCollapsed,
  onSubmitAgentPrompt,
  selectedServer,
  selection,
  syncNotice,
  topCollapsed,
  world,
}: HiveViewportOverlaysProps) {
  return (
    <>
      <EditorChromeControls
        bottomCollapsed={bottomCollapsed}
        onToggleBottom={() => onSetBottomCollapsed((value) => !value)}
        onToggleTop={() => onSetTopCollapsed((value) => !value)}
        topCollapsed={topCollapsed}
      />
      <div
        aria-hidden={miniMapCollapsed}
        className={[
          'absolute top-24 right-4 z-20 origin-top-right transition-[opacity,transform,visibility] duration-300 ease-out',
          miniMapCollapsed
            ? 'pointer-events-none invisible translate-x-4 scale-95 opacity-0'
            : 'pointer-events-auto visible translate-x-0 scale-100 opacity-100',
        ].join(' ')}
      >
        <HiveMiniMap
          collapsed={false}
          npcs={npcs}
          onToggle={() => onSetMiniMapCollapsed((value) => !value)}
          selection={selection}
          server={selectedServer}
          world={world}
        />
      </div>
      <div
        aria-hidden={!chatOpen}
        className={[
          'absolute right-4 left-4 z-20 origin-bottom transition-[opacity,transform,visibility] duration-300 ease-out',
          bottomCollapsed ? 'bottom-16' : 'bottom-28',
          chatOpen
            ? 'pointer-events-auto visible translate-y-0 scale-100 opacity-100'
            : 'pointer-events-none invisible translate-y-6 scale-95 opacity-0',
        ].join(' ')}
      >
        <HiveAgentComposer
          lastMessage={agentMessages.at(-1) ?? null}
          onSubmit={onSubmitAgentPrompt}
        />
      </div>
      {syncNotice ? (
        <div
          className={[
            'pointer-events-none absolute right-4 left-4 z-20 flex justify-center',
            bottomCollapsed ? 'bottom-24' : 'bottom-48',
          ].join(' ')}
        >
          <div className="rounded-lg border border-dynamic-yellow/40 bg-background/90 px-4 py-2 text-dynamic-yellow text-sm shadow-lg backdrop-blur">
            {syncNotice}
          </div>
        </div>
      ) : null}
    </>
  );
}
