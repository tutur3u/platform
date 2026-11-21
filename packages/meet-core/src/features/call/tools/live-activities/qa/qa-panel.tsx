'use client';

import { MessageSquare, Send } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Textarea } from '@tuturuuu/ui/textarea';
import { type FormEvent, useState, useSyncExternalStore } from 'react';
import { LiveActivityPanelFrame } from '../panel-frame';
import {
  askLiveQaQuestion,
  closeLiveQa,
  openLiveQa,
  readLiveQa,
  submitLiveQaAnswer,
  subscribeLiveQa,
} from './qa-store';

export function QaPanel({
  meetingId = 'default',
  role = 'participant',
  participantId = 'guest',
  onClose,
}: {
  meetingId?: string;
  role?: 'host' | 'participant';
  participantId?: string;
  onClose?: () => void;
}) {
  const snapshot = useSyncExternalStore(
    (onStoreChange) => subscribeLiveQa(meetingId, onStoreChange),
    () => readLiveQa(meetingId),
    () => readLiveQa(meetingId)
  );
  const [draftQuestion, setDraftQuestion] = useState('');
  const [draftAnswer, setDraftAnswer] = useState('');
  const isHost = role === 'host';
  const myAnswer = snapshot.answers.find(
    (answer) => answer.participantId === participantId
  );

  const publishQuestion = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    askLiveQaQuestion(meetingId, draftQuestion);
    setDraftQuestion('');
  };

  const sendAnswer = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    submitLiveQaAnswer(meetingId, participantId, draftAnswer);
    setDraftAnswer('');
  };

  return (
    <LiveActivityPanelFrame title="Q&A" onClose={onClose}>
      {isHost && !snapshot.open ? (
        <Button size="sm" variant="outline" onClick={() => openLiveQa(meetingId)}>
          <MessageSquare className="size-4" />
          Open Q&A
        </Button>
      ) : null}
      {isHost && snapshot.open ? (
        <form onSubmit={publishQuestion} className="space-y-3">
          <label className="grid gap-1 font-medium text-sm">
            Question
            <Textarea
              aria-label="Question"
              maxLength={400}
              rows={2}
              value={draftQuestion}
              onChange={(event) => setDraftQuestion(event.target.value)}
              placeholder={snapshot.question ?? 'Ask the room'}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" type="submit" disabled={!draftQuestion.trim()}>
              <Send className="size-4" />
              Ask
            </Button>
            <Button
              size="sm"
              type="button"
              variant="ghost"
              onClick={() => closeLiveQa(meetingId)}
            >
              <MessageSquare className="size-4" />
              End
            </Button>
          </div>
        </form>
      ) : null}
      {snapshot.question ? (
        <section className="space-y-2 rounded-lg border border-border p-3 text-sm">
          <p className="font-semibold text-foreground">{snapshot.question}</p>
          {!isHost ? (
            <form onSubmit={sendAnswer} className="space-y-2">
              <label className="grid gap-1 font-medium">
                Your answer
                <Textarea
                  aria-label="Your answer"
                  maxLength={500}
                  rows={3}
                  value={draftAnswer}
                  onChange={(event) => setDraftAnswer(event.target.value)}
                />
              </label>
              <Button
                size="sm"
                type="submit"
                disabled={!draftAnswer.trim() || Boolean(myAnswer)}
              >
                <Send className="size-4" />
                {myAnswer ? 'Submitted' : 'Submit'}
              </Button>
            </form>
          ) : null}
          {myAnswer ? (
            <p role="status" className="text-muted-foreground">
              Your response: {myAnswer.text}
            </p>
          ) : null}
        </section>
      ) : (
        !isHost && (
          <p role="status" className="text-muted-foreground text-sm">
            Waiting for a question.
          </p>
        )
      )}
      {isHost && snapshot.answers.length > 0 ? (
        <ul className="space-y-2 text-sm">
          {snapshot.answers.map((answer) => (
            <li
              key={answer.id}
              className="rounded-md border border-border px-3 py-2"
            >
              <p className="text-muted-foreground text-xs">
                {answer.participantId}
              </p>
              <p className="wrap-break-word whitespace-pre-wrap">{answer.text}</p>
            </li>
          ))}
        </ul>
      ) : null}
    </LiveActivityPanelFrame>
  );
}