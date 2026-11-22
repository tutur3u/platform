'use client';

import { Play, Plus, Save, Trash2 } from '@tuturuuu/icons';
import { Input } from '@tuturuuu/ui/input';
import { useTranslations } from 'next-intl';
import { ToolAction, ToolIconAction } from '../../tool-ui';
import {
  ActivityEmpty,
  type Activity,
  activityCardClass,
  OptionsEditor,
} from '../activity-kit';
import { useRoomDraft } from '../room-draft';

export const MAX_GAME_ROUNDS = 30;
const DEFAULT_SECONDS = 20;

type SavedRound = NonNullable<Activity['host']>['game']['rounds'][number];
type DraftRound = {
  key: string;
  prompt: string;
  options: string[];
  answer: number | undefined;
  seconds: string;
};

const toDraft = (round: SavedRound): DraftRound => ({
  key: round.id,
  prompt: round.prompt,
  options: round.options,
  answer: round.answer,
  seconds: String(round.seconds),
});

/** Two drafts hold the same words, whatever ids the room gave the rounds. */
const words = (rounds: readonly DraftRound[]) =>
  JSON.stringify(
    rounds.map(({ prompt, options, answer, seconds }) => [
      prompt,
      options,
      answer,
      seconds,
    ])
  );
const sameRounds = (a: readonly DraftRound[], b: readonly DraftRound[]) =>
  words(a) === words(b);

/** What `game.set` accepts, or null while any round is incomplete. */
export function gameRounds(drafts: readonly DraftRound[]) {
  const rounds = [];
  for (const draft of drafts) {
    const prompt = draft.prompt.trim();
    const options = draft.options.map((option) => option.trim());
    const seconds = Number(draft.seconds);
    if (
      !prompt ||
      options.length < 2 ||
      options.some((option) => !option) ||
      draft.answer === undefined ||
      !Number.isInteger(seconds) ||
      seconds < 5 ||
      seconds > 120
    )
      return null;
    rounds.push({ prompt, options, answer: draft.answer, seconds });
  }
  return rounds;
}

/** The host prepares rounds here, saves them to the room and starts the game. */
export function GameRoundsEditor({
  saved,
  send,
}: {
  saved: readonly SavedRound[];
  send: Activity['send'];
}) {
  const t = useTranslations('meet.call.live_activities.game');
  const stored = saved.map(toDraft);
  // The room issues new ids on save and repeats the rounds after a reconnect;
  // neither may replace a round the host is still writing.
  const [drafts, setDrafts] = useRoomDraft(stored, sameRounds);
  const rounds = gameRounds(drafts);
  const dirty = JSON.stringify(rounds) !== JSON.stringify(gameRounds(stored));
  const update = (key: string, patch: Partial<DraftRound>) =>
    setDrafts((current) =>
      current.map((round) =>
        round.key === key ? { ...round, ...patch } : round
      )
    );
  return (
    <div className="space-y-3">
      {!drafts.length && <ActivityEmpty>{t('empty_host')}</ActivityEmpty>}
      <ol className="space-y-3">
        {drafts.map((round, index) => (
          <li key={round.key} className={activityCardClass}>
            <div className="flex items-center gap-2">
              <span className="flex-1 font-semibold text-muted-foreground text-xs">
                {t('round_number', { number: index + 1 })}
              </span>
              <ToolIconAction
                icon={Trash2}
                label={t('remove_round', { number: index + 1 })}
                onClick={() =>
                  setDrafts((current) =>
                    current.filter((entry) => entry.key !== round.key)
                  )
                }
              />
            </div>
            <Input
              value={round.prompt}
              maxLength={240}
              aria-label={t('prompt')}
              placeholder={t('prompt_placeholder')}
              onChange={(event) =>
                update(round.key, { prompt: event.target.value })
              }
            />
            <OptionsEditor
              name={`game-answer-${round.key}`}
              options={round.options}
              answer={round.answer}
              onChange={(options, answer) =>
                update(round.key, { options, answer })
              }
            />
            <label className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">{t('seconds')}</span>
              <Input
                type="number"
                inputMode="numeric"
                min={5}
                max={120}
                value={round.seconds}
                className="w-24"
                onChange={(event) =>
                  update(round.key, { seconds: event.target.value })
                }
              />
            </label>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap items-center gap-2">
        <ToolAction
          icon={Plus}
          label={t('add_round')}
          disabled={drafts.length >= MAX_GAME_ROUNDS}
          onClick={() =>
            setDrafts((current) => [
              ...current,
              {
                key: crypto.randomUUID(),
                prompt: '',
                options: ['', ''],
                answer: undefined,
                seconds: String(DEFAULT_SECONDS),
              },
            ])
          }
        />
        <ToolAction
          icon={Save}
          label={t('save_rounds')}
          disabled={!rounds || !dirty}
          onClick={() => rounds && send({ kind: 'game.set', rounds })}
        />
        <ToolAction
          icon={Play}
          label={t('start')}
          variant="default"
          disabled={dirty || !saved.length}
          onClick={() => send({ kind: 'game.start' })}
        />
      </div>
      {dirty && (
        <p className="text-muted-foreground text-xs">
          {t(rounds ? 'unsaved' : 'incomplete')}
        </p>
      )}
    </div>
  );
}
