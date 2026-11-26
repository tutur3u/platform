'use client';

import { Button } from '@tuturuuu/ui/button';
import { SettingsSection } from '@tuturuuu/ui/custom/settings-section';
import { Input } from '@tuturuuu/ui/input';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import type { PlaybackTrial } from './use-playback-trial';

export function PlaybackTrialPanel({ trial }: { trial: PlaybackTrial }) {
  const t = useTranslations('meet.call.same_room_trial');
  const inputId = useId();
  const [code, setCode] = useState('');
  const [invalid, setInvalid] = useState(false);
  const name = (id: string) =>
    trial.roster[id]?.displayName ?? trial.selected[id] ?? id;

  function download() {
    const file = new Blob(
      [
        JSON.stringify(
          {
            version: 1,
            listenerId: trial.listenerId,
            events: trial.events,
          },
          null,
          2
        ),
      ],
      { type: 'application/json' }
    );
    const url = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'meet-same-room-trace.json';
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <SettingsSection title={t('title')}>
      <form
        className="space-y-3 p-4 text-sm"
        onSubmit={(event) => {
          event.preventDefault();
          setInvalid(!trial.join(code));
        }}
      >
        <div className="space-y-1">
          <label htmlFor={inputId}>{t('code')}</label>
          <Input
            id={inputId}
            value={code}
            onChange={(event) => {
              setCode(event.target.value);
              setInvalid(false);
            }}
            autoComplete="off"
            spellCheck={false}
            maxLength={10}
            placeholder={t('placeholder')}
            disabled={trial.active}
            aria-invalid={invalid}
            aria-describedby={invalid ? `${inputId}-error` : undefined}
          />
        </div>
        <fieldset className="space-y-1">
          <legend>{t('members')}</legend>
          <ul className="max-h-40 space-y-1 overflow-y-auto">
            {trial.options.map(([id, displayName]) => (
              <li key={id}>
                <label className="flex items-start gap-2 break-all">
                  <input
                    type="checkbox"
                    className="mt-1 accent-primary"
                    checked={id in trial.selected}
                    onChange={(event) => {
                      trial.select(id, displayName, event.target.checked);
                      setInvalid(false);
                    }}
                  />
                  {displayName} · {id.slice(-6)}
                  {!trial.roster[id] && t('absent')}
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
        {invalid && (
          <p id={`${inputId}-error`} role="alert" className="text-destructive">
            {t('invalid')}
          </p>
        )}
        <div aria-live="polite" className="text-muted-foreground">
          <p>{t('checksum', { checksum: trial.checksum })}</p>
          <p>
            {t('speaker', {
              name: trial.speaker ? name(trial.speaker) : t('none'),
            })}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {trial.active ? (
            <Button
              key="leave"
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                trial.leave();
                setCode('');
              }}
            >
              {t('leave')}
            </Button>
          ) : (
            <Button key="join" type="submit" size="sm">
              {t('join')}
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={trial.markSync}
          >
            {t('mark_sync')}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={download}
            disabled={trial.events.length === 0}
          >
            {t('download')}
          </Button>
        </div>
        {trial.events.length > 0 && (
          <details>
            <summary>{t('trace')}</summary>
            <ol className="max-h-40 space-y-1 overflow-y-auto pt-2">
              {trial.events.slice(-30).map((event, index) => (
                <li key={index} className="break-all">
                  {new Date(event.atMs).toISOString().slice(11, 23)}
                  {' · '}
                  {t(`event.${event.kind}`)}
                  {event.participantId && ` · ${name(event.participantId)}`}
                  {event.trackId && ` · ${event.trackId}`}
                </li>
              ))}
            </ol>
          </details>
        )}
      </form>
    </SettingsSection>
  );
}
