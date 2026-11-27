'use client';

import { Loader2 } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import type { World, WorldObject } from '@tuturuuu/worlds';
import { useTranslations } from 'next-intl';
import { type FormEvent, useRef, useState } from 'react';
import type { WorldDraft } from '@/lib/worlds/draft-geometry';
import { saveWorldDraft } from './draft-actions';
import {
  geometryFields,
  headings,
  validateObjectGeometry,
} from '@/lib/worlds/object-geometry';

const selectClass =
  'h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring';

export function DraftLoadError() {
  const t = useTranslations('worlds.editor');
  return (
    <div className="mx-auto max-w-3xl space-y-3">
      <p role="alert">{t('load_failed')}</p>
      <Button
        type="button"
        variant="outline"
        onClick={() => window.location.reload()}
      >
        {t('retry_load')}
      </Button>
    </div>
  );
}

type SaveState =
  | {
      kind:
        | 'idle'
        | 'saving'
        | 'saved'
        | 'invalid'
        | 'unavailable'
        | 'forbidden';
    }
  | { kind: 'stale'; latest: WorldDraft };

export function WorldEditor({
  wsId,
  initial,
}: {
  wsId: string;
  initial: WorldDraft;
}) {
  const t = useTranslations('worlds.editor');
  const [draft, setDraft] = useState(initial);
  const [loadedRevision, setLoadedRevision] = useState(initial.revision);
  const [state, setState] = useState<SaveState>({ kind: 'idle' });
  const [selectedId, setSelectedId] = useState(
    initial.world.objects[0]?.id ?? ''
  );
  const inFlight = useRef(false);
  const { world } = draft;
  const selected = world.objects.find(({ id }) => id === selectedId);
  const locked =
    state.kind === 'saving' ||
    state.kind === 'stale' ||
    state.kind === 'forbidden';

  async function save(next: WorldObject) {
    if (locked || inFlight.current) return;
    inFlight.current = true;
    setState({ kind: 'saving' });
    try {
      const result = await saveWorldDraft(wsId, {
        revision: draft.revision,
        geometry: world.objects.map((object) =>
          object.id === next.id ? next : object
        ),
      });
      switch (result.status) {
        case 'ok':
          setDraft(result.draft);
          setState({ kind: 'saved' });
          break;
        case 'stale':
          setState({ kind: 'stale', latest: result.draft });
          break;
        default:
          setState({ kind: result.status });
      }
    } catch {
      setState({ kind: 'unavailable' });
    } finally {
      inFlight.current = false;
    }
  }

  return (
    <section
      aria-label={t('title')}
      className="mx-auto w-full max-w-3xl space-y-6 pb-8"
    >
      <div className="space-y-4 rounded-lg border border-border bg-card p-4 sm:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-semibold">{t('sample')}</h2>
          <p className="text-muted-foreground text-sm">
            {t('bounds', {
              width: world.bounds.width,
              depth: world.bounds.depth,
            })}
          </p>
        </div>
        {selected ? (
          <>
            <div className="grid gap-2">
              <Label htmlFor="world-object">{t('object')}</Label>
              <select
                id="world-object"
                className={selectClass}
                disabled={locked}
                value={selectedId}
                onChange={(event) => {
                  setSelectedId(event.target.value);
                  setState({ kind: 'idle' });
                }}
              >
                {world.objects.map(({ id }) => (
                  <option key={id} value={id}>
                    {id}
                  </option>
                ))}
              </select>
            </div>
            <ObjectForm
              key={loadedRevision + ':' + selected.id}
              object={selected}
              bounds={world.bounds}
              disabled={locked}
              saving={state.kind === 'saving'}
              onEdit={() => setState({ kind: 'idle' })}
              onSave={save}
            />
          </>
        ) : (
          <p className="text-muted-foreground text-sm">{t('empty')}</p>
        )}
        {state.kind === 'saved' && <p role="status">{t('saved')}</p>}
        {state.kind === 'invalid' && <p role="alert">{t('invalid_draft')}</p>}
        {state.kind === 'unavailable' && <p role="alert">{t('save_failed')}</p>}
        {state.kind === 'forbidden' && (
          <p role="alert">{t('save_forbidden')}</p>
        )}
        {state.kind === 'stale' && (
          <div className="space-y-2">
            <p role="alert">{t('stale')}</p>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setDraft(state.latest);
                setLoadedRevision(state.latest.revision);
                setState({ kind: 'idle' });
              }}
            >
              {t('load_latest')}
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}

function ObjectForm({
  object,
  bounds,
  disabled,
  saving,
  onEdit,
  onSave,
}: {
  object: WorldObject;
  bounds: World['bounds'];
  disabled: boolean;
  saving: boolean;
  onEdit: () => void;
  onSave: (object: WorldObject) => void;
}) {
  const t = useTranslations('worlds.editor');
  const [status, setStatus] = useState<
    'idle' | 'invalid_numbers' | 'outside_bounds'
  >('idle');

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = validateObjectGeometry(
      new FormData(event.currentTarget),
      object,
      bounds
    );
    if (result.status !== 'valid') {
      setStatus(result.status);
      return;
    }

    onSave(result.object);
    setStatus('idle');
  }

  const invalid = status === 'invalid_numbers' || status === 'outside_bounds';

  return (
    <form
      className="space-y-4"
      onSubmit={handleSubmit}
      onChange={() => {
        setStatus('idle');
        onEdit();
      }}
      aria-busy={saving}
      noValidate
    >
      <fieldset
        disabled={disabled}
        aria-describedby={invalid ? 'world-geometry-status' : undefined}
        className="grid grid-cols-2 gap-4 sm:grid-cols-3"
      >
        <legend className="sr-only">{t('geometry')}</legend>
        {geometryFields.map((field) => (
          <div key={field} className="min-w-0 space-y-2">
            <Label htmlFor={`world-${field}`}>{t(field)}</Label>
            <Input
              id={`world-${field}`}
              name={field}
              type="number"
              step="any"
              defaultValue={object[field]}
            />
          </div>
        ))}
        <div className="min-w-0 space-y-2">
          <Label htmlFor="world-heading">{t('heading')}</Label>
          <select
            id="world-heading"
            name="heading"
            className={selectClass}
            defaultValue={object.heading}
          >
            {headings.map((heading) => (
              <option key={heading} value={heading}>
                {heading}°
              </option>
            ))}
          </select>
        </div>
      </fieldset>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={disabled}>
          {saving && <Loader2 className="animate-spin" aria-hidden="true" />}
          {t('save')}
        </Button>
        <p
          id="world-geometry-status"
          role="status"
          className={
            invalid
              ? 'text-destructive text-sm'
              : 'text-muted-foreground text-sm'
          }
        >
          {status !== 'idle' && t(status)}
        </p>
      </div>
    </form>
  );
}
