import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FileText, MessageSquare } from '@tuturuuu/icons';
import {
  renderCollaborationCaret,
  updateCollaborationCaretPlacements,
} from '@tuturuuu/ui/text-editor/collaboration-carets';
import { NextIntlClientProvider } from 'next-intl';
import { useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import messages from '../../../../apps/meet/messages/en.json';
import '../../../../packages/ui/src/globals.css';
import { StageLayoutView } from '../../src/features/call/stage-layout/stage-layout-view';
import {
  ActivityDockPresence,
  type ActivityPresencePerson,
} from '../../src/features/call/stage-layout/activity-presence';
import { ParticipantTile } from '../../src/features/call/components/participant-tile';
import { useStageLayout } from '../../src/features/call/stage-layout/use-stage-layout';
import {
  LiveQaClientContext,
  QaPanel,
} from '../../src/features/call/tools/live-activities/qa/qa-panel';
import { createLiveQaClient } from '../../src/features/call/tools/live-activities/qa/qa-store';

const params = new URLSearchParams(location.search);
document.documentElement.classList.toggle(
  'dark',
  params.get('theme') !== 'light'
);
if (params.get('ui') === 'sorbet')
  document.documentElement.dataset.ui = 'sorbet';

const queryClient = new QueryClient();
const qaClient = createLiveQaClient({
  send: () => {},
  subscribe: () => () => {},
});

function SharedDocFixture() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const h1Ref = useRef<HTMLHeadingElement>(null);
  const lowerRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const h1 = h1Ref.current;
    const lower = lowerRef.current;
    if (!h1 || !lower) return;
    const topCaret = renderCollaborationCaret({
      id: 'vmkhoiii',
      name: 'vmkhoiii',
      color: '#e11d48',
    });
    const lowerCaret = renderCollaborationCaret({
      id: 'alex',
      name: 'Alex',
      color: '#2563eb',
    });
    h1.append(topCaret);
    lower.append(lowerCaret);
    return () => {
      topCaret.remove();
      lowerCaret.remove();
    };
  }, []);

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <div
        ref={scrollRef}
        data-testid="doc-scroll"
        className="min-h-0 flex-1 overflow-auto"
        onScroll={(event) =>
          updateCollaborationCaretPlacements(event.currentTarget)
        }
      >
        <div
          data-testid="doc-toolbar"
          className="sticky top-0 z-10 flex h-10 items-center gap-2 border-b bg-background px-4 text-muted-foreground text-xs"
        >
          <span>Ask Mira</span>
          <span>B</span>
          <span>I</span>
          <span>Tools</span>
        </div>
        <div className="ProseMirror min-h-[360px] px-6 pt-4 pb-12">
          <h1 ref={h1Ref} className="mt-0 font-bold text-4xl">
            Marketing plan
          </h1>
          <p className="my-3 leading-7">Shared marketing team</p>
          <p className="my-3 leading-7">Budget and directions</p>
          <p ref={lowerRef} className="my-3 leading-7">
            Priorities
          </p>
        </div>
      </div>
    </section>
  );
}

const isHost = params.get('role') === 'host';
const closedForEveryone: string[] = [];
(window as unknown as { __closedForEveryone?: string[] }).__closedForEveryone =
  closedForEveryone;

const PRESENCE_BY_ACTIVITY: Record<string, readonly ActivityPresencePerson[]> =
  {
    document: [
      {
        userId: 'u-vmkhoiii',
        displayName: 'vmkhoiii',
        activityTitle: 'Shared document',
      },
    ],
    'tool:live-qa': [
      {
        userId: 'u-alex',
        displayName: 'Alex',
        following: true,
        activityTitle: 'Q&A',
      },
    ],
  };

const DOCK_PRESENCE: readonly ActivityPresencePerson[] = [
  ...PRESENCE_BY_ACTIVITY.document!,
  ...PRESENCE_BY_ACTIVITY['tool:live-qa']!,
];

const FIXTURE_PARTICIPANT = {
  userId: '00000000-0000-4000-8000-000000000001',
  displayName: 'vmkhoiii',
  role: 'speaker' as const,
  joinedAt: '2026-11-27T00:00:00.000Z',
  lastSeenAt: '2026-11-27T00:00:00.000Z',
  media: { audioEnabled: false, videoEnabled: false, screenEnabled: false },
};

function FixtureApp() {
  const controller = useStageLayout({
    accountId: 'fixture-user',
    meetingId: 'fixture-meeting',
    isAvailable: () => true,
    tier: 'desktop',
  });

  useEffect(() => {
    controller.open('document');
    controller.open('tool:live-qa');
  }, [controller.open]);

  return (
    <div className="flex h-screen w-screen flex-col gap-2 bg-background p-3 text-foreground">
      <div className="min-h-0 flex-1">
        <StageLayoutView
          controller={controller}
          peopleCount={2}
          presenceByActivity={PRESENCE_BY_ACTIVITY}
          stage={
            <div className="h-full w-40">
              <ParticipantTile
                participant={FIXTURE_PARTICIPANT}
                presenceOnly
                resumePlaybackLabel="Resume"
                activityBadge={{ title: 'Shared document' }}
                className="h-full w-full"
              />
            </div>
          }
          onCloseForEveryone={
            isHost
              ? (id) => {
                  closedForEveryone.push(id);
                  controller.close(id);
                }
              : undefined
          }
          activities={controller.openIds.map((id) => ({
            id,
            title: id === 'document' ? 'Shared document' : 'Q&A',
            icon: id === 'document' ? FileText : MessageSquare,
            content:
              id === 'document' ? (
                <SharedDocFixture />
              ) : (
                <QaPanel meetingId="fixture-meeting" />
              ),
          }))}
        />
      </div>
      <div
        data-testid="fixture-dock"
        className="flex shrink-0 items-center justify-center gap-2 border-t pt-2"
      >
        <span className="text-xs font-medium">Activities</span>
        <ActivityDockPresence people={DOCK_PRESENCE} />
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={queryClient}>
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <LiveQaClientContext value={qaClient}>
        <FixtureApp />
      </LiveQaClientContext>
    </NextIntlClientProvider>
  </QueryClientProvider>
);
