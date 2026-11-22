'use client';
import { LayoutGrid, Sparkles } from '@tuturuuu/icons';
import type { MeetReaction } from '@tuturuuu/realtime/meet';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type { CameraLook } from '../lib/camera-effects';
import { ReactionPicker } from './call-reactions';
import { CameraEffectsDialog } from './camera-effects-dialog';
import type { CallLayout } from './call-stage';
import { ControlButton } from './control-bar';
import { LayoutDialog } from './layout-dialog';

export type CallExtrasDialog = 'layout' | 'effects' | null;

/** Dialog state lives outside the More popover so closing the menu keeps it open. */
export function useCallExtrasDialog() {
  return useState<CallExtrasDialog>(null);
}

/**
 * More-menu rows for the stage layout and camera effects. Each row opens its
 * own dialog (rendered by `CallExtrasDialogs`) instead of expanding in place.
 * On phones in media rooms the reactions row lives here too.
 */
export function CallExtras({
  layout,
  look,
  react,
  onOpen,
  presenceOnly = false,
}: {
  layout: CallLayout;
  look: CameraLook;
  /** Shown only on phones in media rooms, where the root bar has no room for it. */
  react?: (reaction: MeetReaction) => void;
  onOpen: (dialog: Exclude<CallExtrasDialog, null>) => void;
  presenceOnly?: boolean;
}) {
  const t = useTranslations('meet.call');
  return (
    <>
      {react && !presenceOnly && (
        <div className="px-1 sm:hidden">
          <ReactionPicker react={react} />
        </div>
      )}
      {!presenceOnly && (
        <>
          <ControlButton
            icon={LayoutGrid}
            label={t('layout')}
            detail={t(`layout_${layout}`)}
            onClick={() => onOpen('layout')}
          />
          <ControlButton
            icon={Sparkles}
            label={t('camera_effects')}
            detail={t(`filter_${look.filter}`)}
            onClick={() => onOpen('effects')}
          />
        </>
      )}
    </>
  );
}

export function CallExtrasDialogs({
  dialog,
  onDialog,
  layout,
  setLayout,
  look,
  setLook,
  stream,
}: {
  dialog: CallExtrasDialog;
  onDialog: (dialog: CallExtrasDialog) => void;
  layout: CallLayout;
  setLayout: (layout: CallLayout) => void;
  look: CameraLook;
  setLook: (look: CameraLook) => Promise<void>;
  stream: MediaStream | null;
}) {
  const close = (open: boolean) => {
    if (!open) onDialog(null);
  };
  return (
    <>
      <LayoutDialog
        open={dialog === 'layout'}
        onOpenChange={close}
        layout={layout}
        setLayout={setLayout}
      />
      <CameraEffectsDialog
        open={dialog === 'effects'}
        onOpenChange={close}
        look={look}
        setLook={setLook}
        stream={stream}
      />
    </>
  );
}
