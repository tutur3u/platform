import { BarChart3, Clock3, Layers } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { useTranslations } from 'next-intl';
import { NuqsTestingAdapter } from 'nuqs/adapters/testing';
import { useMemo, useState } from 'react';
import { ActivitiesMenu } from '../../src/features/call/components/activities-menu';
import { CallTimers } from '../../src/features/call/components/call-clock';
import { ClassTimerControls } from '../../src/features/call/components/class-timer';
import { ClassroomSettings } from '../../src/features/call/components/classroom-settings';
import { DefaultActivitySetting } from '../../src/features/call/components/default-activity-setting';
import { ParticipantTile } from '../../src/features/call/components/participant-tile';
import { ShareMeetingButton } from '../../src/features/call/components/share-meeting';
import { ThumbnailModeSetting } from '../../src/features/call/components/thumbnail-mode-setting';
import {
  type CallState,
  INITIAL_CALL_STATE,
} from '../../src/features/call/lib/call-state';
import type {
  MediaPolicy,
  SmallModePreference,
} from '../../src/features/call/lib/media-policy';
import {
  LiveQaClientContext,
  QaPanel,
} from '../../src/features/call/tools/live-activities/qa/qa-panel';
import { createLiveQaClient } from '../../src/features/call/tools/live-activities/qa/qa-store';
import type { MeetToolDefinition } from '../../src/features/call/tools/registry';

const SCREEN_PARTICIPANT = {
  userId: '00000000-0000-4000-8000-000000000001',
  displayName: 'vmkhoiii',
  role: 'speaker' as const,
  joinedAt: '2026-11-27T00:00:00.000Z',
  lastSeenAt: '2026-11-27T00:00:00.000Z',
  media: { audioEnabled: false, videoEnabled: false, screenEnabled: true },
};

const FIXTURE_TOOLS: MeetToolDefinition[] = [
  {
    id: 'polls',
    label: 'meet.call.polls.title',
    icon: BarChart3,
    Panel: () => null,
  },
  {
    id: 'live-flashcards',
    label: 'meet.call.live_activities.flashcards.title',
    icon: Layers,
    Panel: () => null,
  },
];

function createStubPolicy(): MediaPolicy {
  let pref: SmallModePreference = 'auto';
  const listeners = new Set<() => void>();
  return {
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () =>
      ({ smallModePreference: pref }) as ReturnType<MediaPolicy['getSnapshot']>,
    setSmallModePreference: (next: SmallModePreference) => {
      pref = next;
      for (const listener of listeners) listener();
    },
  } as unknown as MediaPolicy;
}

export function PolishScene() {
  const t = useTranslations('meet.call');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [defaultActivity, setDefaultActivity] = useState<string | null>(null);
  const [maxParticipants, setMaxParticipants] = useState<number>(30);
  const policy = useMemo(() => createStubPolicy(), []);

  const qaClient = useMemo(
    () =>
      createLiveQaClient({
        send: () => {},
        subscribe: () => () => {},
      }),
    []
  );

  const timerState = useMemo<CallState>(
    () => ({
      ...INITIAL_CALL_STATE,
      role: 'host',
      classRole: 'host',
      classTimerEnabled: true,
      classTimerClockSkew: 0,
      maxParticipants: 50,
      classViewersAvailable: true,
      settings: {
        ...INITIAL_CALL_STATE.settings,
        maxParticipants,
      },
      classTimer: {
        id: 'fixture-timer',
        status: 'running',
        durationMs: 300_000,
        remainingMs: 300_000,
        endsAt: new Date(Date.now() + 300_000).toISOString(),
        updatedAt: new Date().toISOString(),
      },
    }),
    [maxParticipants]
  );

  const roomStub = useMemo(
    () => ({
      state: timerState,
      updateSettings: (patch: Partial<CallState['settings']>) => {
        if (typeof patch.maxParticipants === 'number')
          setMaxParticipants(patch.maxParticipants);
      },
    }),
    [timerState]
  );

  return (
    <NuqsTestingAdapter>
      <LiveQaClientContext value={qaClient}>
        <div className="flex h-screen w-screen flex-col gap-3 bg-background p-4 text-foreground">
          <header className="flex flex-wrap items-center gap-2 border-b pb-3">
            <CallTimers state={timerState} />
            <ActivitiesMenu
              tools={FIXTURE_TOOLS}
              openToolIds={[]}
              onTool={() => {}}
              pages={[
                {
                  id: 'class-timer',
                  label: t('class_timer'),
                  icon: Clock3,
                  active: false,
                  page: () => (
                    <ClassTimerControls
                      meetingId="fixture-meeting"
                      state={timerState}
                    />
                  ),
                },
              ]}
            />
            <ShareMeetingButton
              meetingId="00000000-0000-4000-8000-000000000042"
              meetingName="EduFest 2026"
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              data-testid="open-settings-fixture"
              onClick={() => setSettingsOpen(true)}
            >
              {t('classroom.title')}
            </Button>
          </header>

          <Button
            type="button"
            size="sm"
            variant="outline"
            style={{ position: 'fixed', bottom: 16, left: 16, zIndex: 60 }}
            data-testid="open-focus-overlay-dialog"
            onClick={() => setOverlayOpen(true)}
          >
            Open overlay
          </Button>

          <div className="grid min-h-0 flex-1 grid-cols-2 gap-4">
            <div
              data-testid="polish-qa-container"
              className="flex min-h-0 flex-col overflow-hidden rounded-2xl border bg-card"
            >
              <QaPanel meetingId="fixture-meeting" />
            </div>
            <div className="min-h-0">
              <ParticipantTile
                participant={SCREEN_PARTICIPANT}
                kind="screen"
                presenceOnly
                resumePlaybackLabel={t('resume_audio')}
                className="h-full w-full"
              />
            </div>
          </div>

          <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
            <DialogContent
              data-testid="polish-settings-dialog"
              className="sm:max-w-lg"
            >
              <DialogHeader>
                <DialogTitle>{t('settings')}</DialogTitle>
                <DialogDescription>{t('room_maximum')}</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <ClassroomSettings room={roomStub} />
                <DefaultActivitySetting
                  value={defaultActivity}
                  tools={FIXTURE_TOOLS}
                  onChange={setDefaultActivity}
                />
                <ThumbnailModeSetting policy={policy} />
                <Select value="">
                  <SelectTrigger
                    data-testid="empty-select-trigger"
                    aria-label={t('forms.chooseForm')}
                    className="w-full"
                  >
                    <SelectValue placeholder={t('forms.chooseForm')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sample">{t('forms.title')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={overlayOpen} onOpenChange={setOverlayOpen}>
            <DialogContent
              data-testid="focus-overlay-dialog"
              style={{ zIndex: 70 }}
              className="sm:max-w-sm"
            >
              <DialogHeader>
                <DialogTitle>{t('classroom.title')}</DialogTitle>
                <DialogDescription>{t('share.title')}</DialogDescription>
              </DialogHeader>
            </DialogContent>
          </Dialog>
        </div>
      </LiveQaClientContext>
    </NuqsTestingAdapter>
  );
}
