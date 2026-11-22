'use client';

import { Play, Plus, Save, Sparkles, X } from '@tuturuuu/icons';
import {
  type PollDefinition,
  pollDefinitionSchema,
} from '@tuturuuu/realtime/meet/room-polls';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { Switch } from '@tuturuuu/ui/switch';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useTranslations } from 'next-intl';
import { type FormEvent, useId, useRef, useState } from 'react';
import { MiraAdultNotice } from '../../../live-assistant/mira-adult-notice';
import type { PollActionResult } from '../../lib/polls-client';
import type { PollAction } from '../../server/polls';
import { ToolAction, ToolIconAction } from '../tool-ui';

const types = [
  'single_choice',
  'multiple_choice',
  'rating',
  'word_cloud',
  'open_text',
] as const;
export const pollSelectClass =
  'h-9 w-full rounded-full border border-input bg-background px-3.5 text-foreground text-sm focus-visible:outline-2 focus-visible:outline-ring';
const MAX_CHOICES = 10;

type Choice = { key: number; label: string };

export function PollComposer({
  busy,
  locale,
  onSubmit,
}: {
  busy: boolean;
  locale: 'en' | 'vi';
  onSubmit: (action: PollAction) => Promise<PollActionResult>;
}) {
  const t = useTranslations('meet.call.polls');
  const id = useId();
  const nextKey = useRef(2);
  const [mode, setMode] = useState<'manual' | 'mira'>();
  const [type, setType] = useState<PollDefinition['type']>('single_choice');
  const [question, setQuestion] = useState('');
  const [choices, setChoices] = useState<Choice[]>([
    { key: 0, label: '' },
    { key: 1, label: '' },
  ]);
  const [limit, setLimit] = useState(2);
  const [scale, setScale] = useState(5);
  const [anonymous, setAnonymous] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const withChoices = type === 'single_choice' || type === 'multiple_choice';

  const reset = () => {
    setMode(undefined);
    setQuestion('');
    setChoices([
      { key: 0, label: '' },
      { key: 1, label: '' },
    ]);
    setInvalid(false);
  };
  const definition = () => {
    const options = choices
      .map((choice) => choice.label.trim())
      .filter(Boolean);
    return pollDefinitionSchema.safeParse({
      type,
      question,
      ...(type === 'single_choice'
        ? { options }
        : type === 'multiple_choice'
          ? { options, maxChoices: limit }
          : type === 'rating'
            ? { min: 1, max: scale }
            : {}),
    });
  };
  const submit = async (start: boolean) => {
    if (mode === 'mira') {
      if (!question.trim()) return setInvalid(true);
      setInvalid(false);
      try {
        await onSubmit({
          action: 'mira_draft',
          prompt: question,
          anonymous,
          locale,
        });
        reset();
      } catch {
        // The mutation keeps the error; the form keeps the inputs.
      }
      return;
    }
    const parsed = definition();
    if (!parsed.success) return setInvalid(true);
    setInvalid(false);
    try {
      const created = await onSubmit({
        action: 'create',
        definition: parsed.data,
        anonymous,
      });
      if (start && created.pollId)
        await onSubmit({ action: 'launch', pollId: created.pollId });
      reset();
    } catch {
      // The mutation keeps the error; the form keeps the inputs.
    }
  };

  if (!mode)
    return (
      <div className="flex flex-wrap gap-2">
        <ToolAction
          icon={Plus}
          label={t('new_poll')}
          disabled={busy}
          onClick={() => setMode('manual')}
        />
        <ToolAction
          icon={Sparkles}
          label={t('mira_draft')}
          aria-describedby={`${id}-adults`}
          disabled={busy}
          onClick={() => setMode('mira')}
        />
        <MiraAdultNotice id={`${id}-adults`} className="basis-full" />
      </div>
    );

  return (
    <form
      onSubmit={(event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        void submit(true);
      }}
      className="flex flex-col gap-4 rounded-xl border bg-card p-4 text-sm"
    >
      {mode === 'manual' && (
        <div className="grid gap-1.5">
          <Label htmlFor={`${id}-type`}>{t('format')}</Label>
          <select
            id={`${id}-type`}
            className={pollSelectClass}
            value={type}
            onChange={(event) => {
              const selected = types.find(
                (value) => value === event.target.value
              );
              if (selected) setType(selected);
            }}
          >
            {types.map((value) => (
              <option key={value} value={value}>
                {t(value)}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="grid gap-1.5">
        <Label htmlFor={`${id}-question`}>
          {t(mode === 'manual' ? 'question' : 'mira_topic')}
        </Label>
        <Textarea
          id={`${id}-question`}
          autoFocus
          maxLength={mode === 'manual' ? 240 : 600}
          required
          rows={2}
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
        />
      </div>
      {mode === 'manual' && withChoices && (
        <fieldset className="grid gap-2">
          <legend className="mb-1.5 font-medium">{t('choices')}</legend>
          {choices.map((choice, index) => (
            <div key={choice.key} className="flex items-center gap-2">
              <Input
                aria-label={t('option_label', { number: index + 1 })}
                maxLength={120}
                value={choice.label}
                onChange={(event) =>
                  setChoices((current) =>
                    current.map((entry) =>
                      entry.key === choice.key
                        ? { ...entry, label: event.target.value }
                        : entry
                    )
                  )
                }
              />
              {choices.length > 2 && (
                <ToolIconAction
                  icon={X}
                  label={t('remove_option', { number: index + 1 })}
                  onClick={() =>
                    setChoices((current) =>
                      current.filter((entry) => entry.key !== choice.key)
                    )
                  }
                />
              )}
            </div>
          ))}
          {choices.length < MAX_CHOICES && (
            <ToolAction
              icon={Plus}
              label={t('add_option')}
              variant="ghost"
              className="justify-self-start"
              onClick={() =>
                setChoices((current) => [
                  ...current,
                  { key: nextKey.current++, label: '' },
                ])
              }
            />
          )}
        </fieldset>
      )}
      {mode === 'manual' && type === 'multiple_choice' && (
        <div className="grid gap-1.5">
          <Label htmlFor={`${id}-limit`}>{t('max_choices')}</Label>
          <Input
            id={`${id}-limit`}
            type="number"
            min={1}
            max={MAX_CHOICES}
            required
            value={limit || ''}
            onChange={(event) => setLimit(Number(event.target.value))}
          />
        </div>
      )}
      {mode === 'manual' && type === 'rating' && (
        <div className="grid gap-1.5">
          <Label htmlFor={`${id}-scale`}>{t('scale')}</Label>
          <select
            id={`${id}-scale`}
            className={pollSelectClass}
            value={scale}
            onChange={(event) => setScale(Number(event.target.value))}
          >
            <option value={5}>{t('range', { min: 1, max: 5 })}</option>
            <option value={10}>{t('range', { min: 1, max: 10 })}</option>
          </select>
        </div>
      )}
      <div className="flex items-center gap-3">
        <Switch
          id={`${id}-anonymous`}
          checked={anonymous}
          onCheckedChange={setAnonymous}
        />
        <Label htmlFor={`${id}-anonymous`}>{t('anonymous')}</Label>
      </div>
      {invalid && (
        <p role="alert" className="text-destructive">
          {t('invalid')}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {mode === 'manual' ? (
          <>
            <ToolAction
              type="submit"
              variant="default"
              icon={Play}
              label={t('start')}
              busy={busy}
            />
            <ToolAction
              icon={Save}
              label={t('save_draft')}
              disabled={busy}
              onClick={() => void submit(false)}
            />
          </>
        ) : (
          <>
            <MiraAdultNotice id={`${id}-adults`} className="basis-full" />
            <ToolAction
              type="submit"
              variant="default"
              icon={Sparkles}
              label={t('mira_draft')}
              aria-describedby={`${id}-adults`}
              busy={busy}
            />
          </>
        )}
        <ToolAction
          icon={X}
          label={t('cancel')}
          variant="ghost"
          disabled={busy}
          onClick={reset}
        />
      </div>
    </form>
  );
}
