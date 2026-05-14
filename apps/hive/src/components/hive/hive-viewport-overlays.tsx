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
  npcLabCollapsed: boolean;
  npcs: HiveNpc[];
  onSetChatOpen: Dispatch<SetStateAction<boolean>>;
  onSetMiniMapCollapsed: Dispatch<SetStateAction<boolean>>;
  onSetNpcLabCollapsed: Dispatch<SetStateAction<boolean>>;
  onSetRightCollapsed: Dispatch<SetStateAction<boolean>>;
  onSetTopCollapsed: Dispatch<SetStateAction<boolean>>;
  onSetBottomCollapsed: Dispatch<SetStateAction<boolean>>;
  onSubmitAgentPrompt: (prompt: string) => void;
  rightCollapsed: boolean;
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
  npcLabCollapsed,
  npcs,
  onSetBottomCollapsed,
  onSetChatOpen,
  onSetMiniMapCollapsed,
  onSetNpcLabCollapsed,
  onSetRightCollapsed,
  onSetTopCollapsed,
  onSubmitAgentPrompt,
  rightCollapsed,
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
        chatOpen={chatOpen}
        npcLabCollapsed={npcLabCollapsed}
        onToggleBottom={() => onSetBottomCollapsed((value) => !value)}
        onToggleChat={() => onSetChatOpen((value) => !value)}
        onToggleNpcLab={() => onSetNpcLabCollapsed((value) => !value)}
        onToggleRight={() => onSetRightCollapsed((value) => !value)}
        onToggleTop={() => onSetTopCollapsed((value) => !value)}
        rightCollapsed={rightCollapsed}
        topCollapsed={topCollapsed}
      />
      <div
        className={[
          'absolute top-24 z-20 transition-all duration-300 ease-out',
          rightCollapsed ? 'right-4' : 'right-[404px]',
        ].join(' ')}
      >
        <HiveMiniMap
          collapsed={miniMapCollapsed}
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
          'absolute right-4 left-4 z-20 transition duration-300 ease-out',
          bottomCollapsed ? 'bottom-16' : 'bottom-28',
          chatOpen
            ? 'pointer-events-none visible translate-y-0 opacity-100'
            : 'pointer-events-none invisible translate-y-6 opacity-0',
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
