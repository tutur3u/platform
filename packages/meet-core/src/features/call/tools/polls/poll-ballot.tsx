'use client';

import { Send } from '@tuturuuu/icons';
import type {
  PollResponse,
  ProjectedPoll,
} from '@tuturuuu/realtime/meet/room-polls';
import { Input } from '@tuturuuu/ui/input';
import { Textarea } from '@tuturuuu/ui/textarea';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ToolAction } from '../tool-ui';

const choiceClass =
  'flex min-h-11 min-w-0 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 hover:bg-accent has-checked:border-foreground/40 has-checked:bg-accent has-disabled:cursor-not-allowed has-disabled:opacity-60';

export function PollBallot({
  poll,
  busy,
  onVote,
}: {
  poll: ProjectedPoll;
  busy: boolean;
  onVote: (response: PollResponse) => void;
}) {
  const t = useTranslations('meet.call.polls');
  const draft = poll.status === 'draft';
  const [response, setResponse] = useState<PollResponse | null>(
    poll.myResponse
  );
  const selected =
    response?.type === 'multiple_choice'
      ? response.optionIds
      : response?.type === 'single_choice'
        ? [response.optionId]
        : [];
  const text = response && 'text' in response ? response.text : '';
  const valid =
    !!response &&
    (response.type === 'multiple_choice'
      ? selected.length > 0
      : 'text' in response
        ? text.trim().length > 0
        : true);
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (!draft && response && valid) onVote(response);
      }}
    >
      <fieldset
        disabled={busy || draft}
        className="flex min-w-0 flex-col gap-2"
      >
        <legend className="sr-only">{poll.question}</legend>
        {'options' in poll && (
          <>
            {poll.type === 'multiple_choice' && (
              <p className="text-muted-foreground">
                {t('choose_limit', { count: poll.maxChoices })}
              </p>
            )}
            {poll.options.map(({ id, label }) => (
              <label key={id} className={choiceClass}>
                <input
                  type={poll.type === 'single_choice' ? 'radio' : 'checkbox'}
                  name={poll.id}
                  className="size-4 shrink-0 accent-primary"
                  checked={selected.includes(id)}
                  disabled={
                    poll.type === 'multiple_choice' &&
                    selected.length >= poll.maxChoices &&
                    !selected.includes(id)
                  }
                  onChange={() =>
                    setResponse(
                      poll.type === 'single_choice'
                        ? { type: poll.type, optionId: id }
                        : {
                            type: poll.type,
                            optionIds: selected.includes(id)
                              ? selected.filter((value) => value !== id)
                              : [...selected, id],
                          }
                    )
                  }
                />
                <span className="min-w-0 wrap-break-word">{label}</span>
              </label>
            ))}
          </>
        )}
        {poll.type === 'rating' && (
          <div className="flex flex-wrap gap-2">
            {Array.from(
              { length: poll.max - poll.min + 1 },
              (_, index) => index + poll.min
            ).map((rating) => (
              <label
                key={rating}
                className={cn(
                  choiceClass,
                  'min-w-11 justify-center rounded-full px-0 tabular-nums'
                )}
              >
                <input
                  type="radio"
                  name={poll.id}
                  className="sr-only"
                  checked={
                    response?.type === 'rating' && response.rating === rating
                  }
                  onChange={() => setResponse({ type: 'rating', rating })}
                />
                {rating}
              </label>
            ))}
          </div>
        )}
        {!draft &&
          (poll.type === 'word_cloud' || poll.type === 'open_text') && (
            <label className="grid gap-1.5">
              <span className="font-medium">{t('your_answer')}</span>
              {poll.type === 'word_cloud' ? (
                <Input
                  value={text}
                  maxLength={60}
                  onChange={(event) =>
                    setResponse({
                      type: 'word_cloud',
                      text: event.target.value,
                    })
                  }
                />
              ) : (
                <Textarea
                  value={text}
                  rows={3}
                  maxLength={500}
                  onChange={(event) =>
                    setResponse({ type: 'open_text', text: event.target.value })
                  }
                />
              )}
            </label>
          )}
        {!draft && (
          <ToolAction
            type="submit"
            variant="default"
            icon={Send}
            label={t(poll.myResponse ? 'update_vote' : 'vote')}
            className="mt-1 self-start"
            disabled={!valid}
            busy={busy}
          />
        )}
      </fieldset>
    </form>
  );
}
