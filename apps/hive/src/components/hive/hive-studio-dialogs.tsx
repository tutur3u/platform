'use client';

import type { HiveServer } from '@/engine/types';
import {
  ConfirmActionDialog,
  ServerEditorDialog,
} from './panels/server-admin-dialogs';

type ServerPayload = Pick<
  HiveServer,
  'description' | 'enabled' | 'maxPlayers' | 'name'
>;

type HiveStudioDialogsProps = {
  deleteServerOpen: boolean;
  onCreateServer: (payload: ServerPayload) => void;
  onDeleteServer: (serverId: string) => void;
  onResetWorld: (mode: 'clear' | 'reseed') => void;
  onSetDeleteServerOpen: (open: boolean) => void;
  onSetServerActionTarget: (server: HiveServer | null) => void;
  onSetServerDialogMode: (mode: 'create' | 'edit' | null) => void;
  onSetWorldAction: (action: 'clear' | 'reseed' | null) => void;
  onUpdateServer: (serverId: string, payload: Partial<ServerPayload>) => void;
  selectedServer?: HiveServer | null;
  serverActionTarget: HiveServer | null;
  serverDialogMode: 'create' | 'edit' | null;
  worldAction: 'clear' | 'reseed' | null;
};

export function HiveStudioDialogs({
  deleteServerOpen,
  onCreateServer,
  onDeleteServer,
  onResetWorld,
  onSetDeleteServerOpen,
  onSetServerActionTarget,
  onSetServerDialogMode,
  onSetWorldAction,
  onUpdateServer,
  selectedServer,
  serverActionTarget,
  serverDialogMode,
  worldAction,
}: HiveStudioDialogsProps) {
  const editServer = serverActionTarget ?? selectedServer ?? null;

  return (
    <>
      <ServerEditorDialog
        mode={serverDialogMode ?? 'create'}
        onOpenChange={(open) => {
          if (!open) {
            onSetServerDialogMode(null);
            onSetServerActionTarget(null);
          }
        }}
        onSubmit={(payload) => {
          if (serverDialogMode === 'edit' && editServer) {
            onUpdateServer(editServer.id, payload);
            return;
          }
          onCreateServer(payload);
        }}
        open={serverDialogMode !== null}
        server={serverDialogMode === 'edit' ? editServer : null}
      />
      <ConfirmActionDialog
        description={`Delete ${serverActionTarget?.name ?? 'this server'} and its Hive world history. This cannot be undone.`}
        onConfirm={() => {
          if (serverActionTarget) onDeleteServer(serverActionTarget.id);
          onSetServerActionTarget(null);
          onSetDeleteServerOpen(false);
        }}
        onOpenChange={(open) => {
          onSetDeleteServerOpen(open);
          if (!open) onSetServerActionTarget(null);
        }}
        open={deleteServerOpen}
        title="Delete Hive server?"
      />
      <ConfirmActionDialog
        description={
          worldAction === 'clear'
            ? 'Remove every block and object from this world.'
            : 'Replace this world with the default research garden seed.'
        }
        onConfirm={() => {
          if (worldAction) onResetWorld(worldAction);
          onSetWorldAction(null);
        }}
        onOpenChange={(open) => {
          if (!open) onSetWorldAction(null);
        }}
        open={worldAction !== null}
        title={worldAction === 'clear' ? 'Clear world?' : 'Reseed world?'}
      />
    </>
  );
}
