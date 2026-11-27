'use client';

import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import type { World, WorldObject } from '@tuturuuu/worlds';
import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import {
  geometryFields,
  headings,
  validateObjectGeometry,
} from './object-geometry';

const selectClass =
  'h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring';

export function WorldEditor({ sample }: { sample: World }) {
  const t = useTranslations('worlds.editor');
  const [world, setWorld] = useState(sample);
  const [selectedId, setSelectedId] = useState(sample.objects[0]?.id ?? '');
  const selected = world.objects.find(({ id }) => id === selectedId);

  return (
    <section
      aria-label={t('title')}
      className="mx-auto w-full max-w-3xl space-y-6 pb-8"
    >
      <p className="text-muted-foreground text-sm">{t('persistence')}</p>
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
                value={selectedId}
                onChange={(event) => setSelectedId(event.target.value)}
              >
                {world.objects.map(({ id }) => (
                  <option key={id} value={id}>
                    {id}
                  </option>
                ))}
              </select>
            </div>
            <ObjectForm
              key={selected.id}
              object={selected}
              bounds={world.bounds}
              onApply={(next) =>
                setWorld((current) => ({
                  ...current,
                  objects: current.objects.map((object) =>
                    object.id === next.id ? next : object
                  ),
                }))
              }
            />
          </>
        ) : (
          <p className="text-muted-foreground text-sm">{t('empty')}</p>
        )}
      </div>
    </section>
  );
}

function ObjectForm({
  object,
  bounds,
  onApply,
}: {
  object: WorldObject;
  bounds: World['bounds'];
  onApply: (object: WorldObject) => void;
}) {
  const t = useTranslations('worlds.editor');
  const [status, setStatus] = useState<
    'idle' | 'applied' | 'invalid_numbers' | 'outside_bounds'
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

    onApply(result.object);
    setStatus('applied');
  }

  const invalid = status === 'invalid_numbers' || status === 'outside_bounds';

  return (
    <form
      className="space-y-4"
      onSubmit={handleSubmit}
      onChange={() => setStatus('idle')}
      noValidate
    >
      <fieldset
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
        <Button type="submit">{t('apply')}</Button>
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
