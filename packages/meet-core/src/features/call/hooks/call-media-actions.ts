'use client';
import { MEETING_APP } from '@tuturuuu/meet-core/runtime';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { type RefObject, useRef, useState } from 'react';
import { getMediaErrorDiagnostic, getMediaErrorKey } from '../lib/media-error';
import { encodeRoomCode } from '../lib/room-code';

export type CallDevice = 'microphone' | 'camera' | 'screen';

/**
 * Runs one device action at a time per device, marks it busy for the
 * controls, and turns a failure into one replaceable toast (with a phone
 * hand-off when this browser cannot share its screen).
 */
export function useCallMediaActions(
  meetingId: string,
  leftRef: RefObject<boolean>
) {
  const t = useTranslations('meet.call');
  const [busyDevices, setBusyDevices] = useState<
    Partial<Record<CallDevice, boolean>>
  >({});
  const pending = useRef(new Set<CallDevice>());
  const runMediaAction = async (
    action: () => Promise<void>,
    device: CallDevice
  ) => {
    if (pending.current.has(device) || leftRef.current) return;
    pending.current.add(device);
    setBusyDevices((current) => ({ ...current, [device]: true }));
    const id = `meet-media-${device}`;
    try {
      await action();
      toast.dismiss(id);
    } catch (error) {
      if (!leftRef.current) {
        const key = getMediaErrorKey(error, device);
        toast.error(t(key), {
          id,
          action:
            device === 'screen' &&
            ['screen_browser_unsupported', 'screen_permission_denied'].includes(
              key
            ) &&
            MEETING_APP === 'meet'
              ? {
                  label: t('share_from_mobile_app'),
                  onClick: () => {
                    window.location.assign(
                      `https://tuturuuu.com/personal/meet?room=${encodeRoomCode(meetingId)}`
                    );
                  },
                }
              : undefined,
          description:
            key === 'media_failed'
              ? t('media_error_code', { code: getMediaErrorDiagnostic(error) })
              : undefined,
        });
      }
    } finally {
      pending.current.delete(device);
      setBusyDevices((current) => ({ ...current, [device]: false }));
    }
  };
  return { busyDevices, runMediaAction };
}
