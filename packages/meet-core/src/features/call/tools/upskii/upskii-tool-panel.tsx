'use client';

import { ArrowLeft, GraduationCap, X } from '@tuturuuu/icons';
import { useTranslations } from 'next-intl';
import { useState, useSyncExternalStore } from 'react';
import { ActivityPanel, type ActivityState } from '../activity-panel';
import type { MeetToolPanelProps } from '../live-activities/meet-tool';
import { ToolAction } from '../tool-ui';
import { upskiiPanelView, upskiiRequestErrorKey } from './upskii-panel-view';
import { UpskiiPicker } from './upskii-picker';
import { UpskiiPresentingView } from './upskii-presenting-view';
import { upskiiRoom } from './upskii-store';

export function UpskiiToolPanel({
  meetingId = 'meeting',
  onClose,
}: MeetToolPanelProps) {
  const t = useTranslations('meet.call.upskii');
  const room = upskiiRoom(meetingId);
  const snapshot = useSyncExternalStore(room.subscribe, room.read, room.read);
  const [choosing, setChoosing] = useState(false);
  const view = upskiiPanelView(snapshot, choosing);
  const { request } = snapshot;
  const busy = request.kind === 'pending';

  const state: ActivityState =
    view.kind === 'connecting'
      ? { kind: 'loading' }
      : view.kind === 'waiting'
        ? { kind: 'empty', title: t('waiting_title') }
        : { kind: 'ready' };

  return (
    <ActivityPanel
      title={t('title')}
      icon={GraduationCap}
      status={view.kind === 'presenting' ? t('presenting') : undefined}
      closeLabel={t('close_panel')}
      onClose={() => onClose?.()}
      state={state}
      busy={busy}
    >
      {request.kind === 'failed' && (
        <p role="alert" className="text-destructive text-sm">
          {t(upskiiRequestErrorKey(request.error))}
        </p>
      )}
      {view.kind === 'presenting' && (
        <UpskiiPresentingView
          presentation={view.presentation}
          actions={
            view.canPresent && (
              <>
                <ToolAction
                  icon={ArrowLeft}
                  label={t('change')}
                  onClick={() => {
                    room.dismissError();
                    setChoosing(true);
                  }}
                />
                <ToolAction
                  icon={X}
                  label={t('stop')}
                  busy={busy && request.action === 'stop'}
                  disabled={busy}
                  onClick={() => room.stop()}
                />
              </>
            )
          }
        />
      )}
      {view.kind === 'picking' && (
        <>
          {view.current && (
            <ToolAction
              icon={ArrowLeft}
              label={t('back_to_presentation')}
              variant="ghost"
              className="self-start"
              onClick={() => setChoosing(false)}
            />
          )}
          <UpskiiPicker
            busy={busy}
            onPresent={(item) => {
              room.present(item);
              setChoosing(false);
            }}
          />
        </>
      )}
    </ActivityPanel>
  );
}
