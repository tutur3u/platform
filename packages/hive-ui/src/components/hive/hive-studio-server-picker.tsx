'use client';

import type { Dispatch, SetStateAction } from 'react';
import type { HiveBuildInfo, HiveServer } from '../../engine/types';
import { HiveServerPicker } from './panels/hive-server-picker';
import type { useHiveStudioEngine } from './use-hive-studio-engine';

type HiveStudioEngine = ReturnType<typeof useHiveStudioEngine>;

type HiveStudioServerPickerProps = {
  buildInfo: HiveBuildInfo;
  engine: HiveStudioEngine;
  isAdmin: boolean;
  onSetDeleteServerOpen: Dispatch<SetStateAction<boolean>>;
  onSetServerActionTarget: Dispatch<SetStateAction<HiveServer | null>>;
  onSetServerDialogMode: Dispatch<SetStateAction<'create' | 'edit' | null>>;
  onSetWorldAction: Dispatch<SetStateAction<'clear' | 'reseed' | null>>;
};

export function HiveStudioServerPicker({
  buildInfo,
  engine,
  isAdmin,
  onSetDeleteServerOpen,
  onSetServerActionTarget,
  onSetServerDialogMode,
  onSetWorldAction,
}: HiveStudioServerPickerProps) {
  return (
    <HiveServerPicker
      activeServerId={engine.serverId}
      buildInfo={buildInfo}
      isAdmin={isAdmin}
      npcs={engine.npcs}
      onCreateServer={() => {
        onSetServerActionTarget(null);
        onSetServerDialogMode('create');
      }}
      onDeleteServer={(server) => {
        onSetServerActionTarget(server);
        onSetDeleteServerOpen(true);
      }}
      onEditServer={(server) => {
        onSetServerActionTarget(server);
        onSetServerDialogMode('edit');
      }}
      onResetWorld={onSetWorldAction}
      onSelectServer={engine.setServerId}
      presenceCount={engine.presenceCount}
      realtimeStatus={engine.realtimeStatus}
      revision={engine.revision}
      server={engine.selectedServer}
      servers={engine.servers}
      world={engine.world}
    />
  );
}
