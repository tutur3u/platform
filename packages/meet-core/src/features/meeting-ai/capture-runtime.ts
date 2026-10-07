import type { MeetAudioCapture, MeetAudioSource } from './audio';
import type { MeetAudioBatcher } from './audio-batches';

const slot = <T>(current: T) => ({ current });

/** Mutable transport belongs to one opaque actor/workspace/meeting lifetime. */
export function createMeetCaptureRuntime(scope: {
  actor: { actorId: string; assertActive: () => void } | null;
  wsId: string;
  meetingId: string;
  enabled: boolean;
  expectedActorId?: string;
}) {
  return {
    scope,
    active: false,
    epoch: 0,
    streams: slot<MeetAudioSource[]>([]),
    busyRef: slot(false),
    mounted: slot(false),
    starting: slot<Promise<void> | null>(null),
    errorRef: slot(false),
    capture: slot<MeetAudioCapture | null>(null),
    preparing: slot<MeetAudioCapture | null>(null),
    durationTimer: slot<ReturnType<typeof setTimeout> | null>(null),
    session: slot<string | null>(null),
    queue: slot(Promise.resolve()),
    pending: slot(0),
    pendingBytes: slot(0),
    batches: slot<MeetAudioBatcher | null>(null),
    recovery: slot(new AbortController()),
    sequence: slot(0),
    finishRef: slot<(() => Promise<void>) | null>(null),
    autoFinishRequested: slot(false),
  };
}
