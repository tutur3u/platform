import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FileText, MessageSquare } from '@tuturuuu/icons';
import {
  Awareness,
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
  Y,
} from '@tuturuuu/realtime/documents';
import { RichTextEditor } from '@tuturuuu/ui/text-editor/editor';
import { updateCollaborationCaretPlacements } from '@tuturuuu/ui/text-editor/collaboration-carets';
import { NextIntlClientProvider } from 'next-intl';
import { useEffect, useMemo, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import messages from '../../../../apps/meet/messages/en.json';
import '../../../../packages/ui/src/globals.css';
import { ParticipantTile } from '../../src/features/call/components/participant-tile';
import {
  ActivityDockPresence,
  type ActivityPresencePerson,
} from '../../src/features/call/stage-layout/activity-presence';
import { StageLayoutView } from '../../src/features/call/stage-layout/stage-layout-view';
import { useStageLayout } from '../../src/features/call/stage-layout/use-stage-layout';
import {
  LiveQaClientContext,
  QaPanel,
} from '../../src/features/call/tools/live-activities/qa/qa-panel';
import { createLiveQaClient } from '../../src/features/call/tools/live-activities/qa/qa-store';

// Mounts the real activity pane chrome, the real shared-document editor (Yjs +
// tiptap with its sticky toolbar and remote caret plugin) and the real presence
// components. Only the transport is local: a remote Yjs/awareness peer stands in
// for the other participants, so the caret path is the production one.
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

const DOCUMENT_FIELD = 'prosemirror';
const LOCAL_USER = { id: 'u-you', name: 'You', color: '#16a34a' };
const REMOTE_USERS = [
  { id: 'u-vmkhoiii', name: 'vmkhoiii', color: '#e11d48', block: 0, offset: 3 },
  { id: 'u-alex', name: 'Alex', color: '#2563eb', block: 3, offset: 2 },
] as const;

function seedDocument() {
  const doc = new Y.Doc();
  doc.transact(() => {
    const blocks = [
      ['heading', 'Marketing plan'],
      ['paragraph', 'Shared marketing team'],
      ['paragraph', 'Budget and directions'],
      ['paragraph', 'Priorities'],
    ] as const;
    const nodes = blocks.map(([type, text]) => {
      const node = new Y.XmlElement(type);
      if (type === 'heading') node.setAttribute('level', '1');
      node.insert(0, [new Y.XmlText(text)]);
      return node;
    });
    doc.getXmlFragment(DOCUMENT_FIELD).insert(0, nodes);
  });
  return doc;
}

function cursorJson(doc: Y.Doc, block: number, offset: number) {
  const element = doc.getXmlFragment(DOCUMENT_FIELD).get(block) as Y.XmlElement;
  const text = element.get(0) as Y.XmlText;
  return Y.relativePositionToJSON(
    Y.createRelativePositionFromTypeIndex(text, offset)
  );
}

function useSharedDocumentPeers() {
  return useMemo(() => {
    const localDoc = seedDocument();
    const awareness = new Awareness(localDoc);
    const remoteDoc = new Y.Doc();
    Y.applyUpdate(remoteDoc, Y.encodeStateAsUpdate(localDoc));
    const remotes = REMOTE_USERS.map((user) => {
      const remote = new Awareness(remoteDoc);
      const cursor = cursorJson(remoteDoc, user.block, user.offset);
      remote.setLocalState({
        user: { id: user.id, name: user.name, color: user.color },
        cursor: { anchor: cursor, head: cursor },
      });
      return remote;
    });
    const sync = () => {
      for (const remote of remotes) {
        applyAwarenessUpdate(
          awareness,
          encodeAwarenessUpdate(remote, [remote.clientID]),
          'fixture'
        );
      }
    };
    return { awareness, localDoc, sync };
  }, []);
}

function SharedDocFixture() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const peers = useSharedDocumentPeers();

  useEffect(() => {
    peers.sync();
    // Remote awareness states expire after 30s without a renewal.
    const timer = window.setInterval(peers.sync, 10_000);
    return () => window.clearInterval(timer);
  }, [peers]);

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
        <RichTextEditor
          content={null}
          fillHeight
          allowCollaboration
          yjsDoc={peers.localDoc}
          yjsProvider={{ awareness: peers.awareness }}
          collaborationUser={LOCAL_USER}
          toolbarToolsLabel="Tools"
          titlePlaceholder="Untitled"
          writePlaceholder="Write together..."
          className="min-h-[360px] border-0 bg-background"
        />
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
