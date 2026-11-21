'use client';

import { Button } from '@tuturuuu/ui/button';
import { Textarea } from '@tuturuuu/ui/textarea';
import {
  createContext,
  useContext,
  useState,
  useSyncExternalStore,
} from 'react';
import type { MeetToolPanelProps } from '../meet-tool';
import { LiveActivityPanelFrame } from '../panel-frame';
import type { LiveQaClient } from './qa-store';
import { liveQaRoom } from './qa-handler';

export const LiveQaClientContext = createContext<LiveQaClient | null>(null);

export function QaPanel({
  meetingId = 'default',
  role,
  participantId,
  onClose,
}: MeetToolPanelProps) {
  const client =
    useContext(LiveQaClientContext) ?? liveQaRoom(meetingId).client;
  return (
    <LiveActivityPanelFrame title="Q&A" onClose={onClose}>
      <ConnectedQa
        client={client}
        isHost={role === 'host'}
        participantId={participantId}
      />
    </LiveActivityPanelFrame>
  );
}

function ConnectedQa({
  client,
  isHost,
  participantId,
}: {
  client: LiveQaClient;
  isHost: boolean;
  participantId?: string;
}) {
  const snapshot = useSyncExternalStore(
    client.subscribe,
    client.read,
    client.read
  );
  const [draft, setDraft] = useState('');
  return (
    <div className="space-y-3">
      <form
        className="space-y-2"
        onSubmit={(event) => {
          event.preventDefault();
          client.send({ type: 'qa.ask', text: draft });
          setDraft('');
        }}
      >
        <label className="grid gap-1 font-medium text-sm">
          Question
          <Textarea
            maxLength={400}
            rows={2}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
        </label>
        <Button size="sm" type="submit" disabled={!draft.trim()}>
          Ask
        </Button>
      </form>
      {isHost && (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => client.send({ type: 'qa.clear' })}
        >
          Clear moderation
        </Button>
      )}
      <ul className="space-y-2 text-sm">
        {snapshot.questions
          .filter((q) => isHost || !q.hidden)
          .map((q) => (
            <li
              key={q.id}
              className="space-y-2 rounded-md border border-border p-3"
            >
              <p className="wrap-break-word whitespace-pre-wrap">{q.text}</p>
              {q.answered && <p role="status">Answered</p>}
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  aria-pressed={q.upvotes.includes(participantId ?? '')}
                  onClick={() =>
                    client.send({
                      type: 'qa.upvote',
                      questionId: q.id,
                      upvoted: !q.upvotes.includes(participantId ?? ''),
                    })
                  }
                >
                  Upvote ({q.upvotes.length})
                </Button>
                {isHost && (
                  <>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        client.send({
                          type: 'qa.moderate',
                          questionId: q.id,
                          field: 'answered',
                          value: !q.answered,
                        })
                      }
                    >
                      {q.answered ? 'Reopen' : 'Mark answered'}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        client.send({
                          type: 'qa.moderate',
                          questionId: q.id,
                          field: 'hidden',
                          value: !q.hidden,
                        })
                      }
                    >
                      {q.hidden ? 'Show' : 'Hide'}
                    </Button>
                  </>
                )}
              </div>
            </li>
          ))}
      </ul>
    </div>
  );
}
