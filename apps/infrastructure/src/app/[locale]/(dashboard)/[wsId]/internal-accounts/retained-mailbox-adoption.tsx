'use client';

import {
  adoptRetainedMailbox,
  inspectRetainedMailboxAdoption,
} from '@tuturuuu/internal-api/infrastructure';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { useTranslations } from 'next-intl';
import { useEffect, useId, useState } from 'react';
import type { MigrationTuple } from './address-migration-session';
import {
  type AdoptionView,
  RetainedMailboxAdoptionSession,
} from './retained-mailbox-adoption-session';

export function RetainedMailboxAdoption({
  tuple,
  storageKey,
  assertActive,
  adopted,
}: {
  tuple: MigrationTuple;
  storageKey: string;
  assertActive(): void;
  adopted(): Promise<void>;
}) {
  const t = useTranslations('internal-accounts.address_migration.adoption');
  const id = useId();
  const [view, setView] = useState<AdoptionView>({ kind: 'idle' });
  const [userId, setUserId] = useState('');
  const [source, setSource] = useState('');
  const [destination, setDestination] = useState('');
  const [ownershipConfirmed, setOwnershipConfirmed] = useState(false);
  const [session] = useState(
    () =>
      new RetainedMailboxAdoptionSession({
        tuple,
        storageKey,
        assertActive,
        adopted,
        changed: setView,
        inspect: inspectRetainedMailboxAdoption,
        adopt: adoptRetainedMailbox,
        storage: {
          getItem: (key) => sessionStorage.getItem(key),
          setItem: (key, value) => sessionStorage.setItem(key, value),
        },
      })
  );
  useEffect(() => {
    session.activate();
    return () => session.retire();
  }, [session]);
  return (
    <section className="space-y-3 rounded-lg border p-3">
      <h3 className="font-medium">{t('title')}</h3>
      <p className="text-muted-foreground text-sm">{t('description')}</p>
      <Button
        type="button"
        variant="outline"
        disabled={view.kind === 'busy'}
        onClick={() => {
          setOwnershipConfirmed(false);
          void session.inspect();
        }}
      >
        {t('inspect')}
      </Button>
      {view.kind === 'review' ? (
        <>
          <p className="break-all font-mono text-xs">
            {t('snapshot', { snapshot: view.receipt.snapshot })}
          </p>
          <Label htmlFor={`${id}-user`}>{t('target')}</Label>
          <Input
            id={`${id}-user`}
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            autoComplete="off"
          />
          <Label htmlFor={`${id}-source`}>{t('source')}</Label>
          <Input
            id={`${id}-source`}
            value={source}
            onChange={(e) => setSource(e.target.value)}
            autoComplete="off"
          />
          <Label htmlFor={`${id}-destination`}>{t('destination')}</Label>
          <Input
            id={`${id}-destination`}
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            autoComplete="off"
          />
          <div className="flex items-start gap-2">
            <input
              id={`${id}-ownership`}
              type="checkbox"
              checked={ownershipConfirmed}
              onChange={(e) => setOwnershipConfirmed(e.target.checked)}
            />
            <Label htmlFor={`${id}-ownership`}>{t('ownership')}</Label>
          </div>
          <Button
            type="button"
            disabled={
              !ownershipConfirmed ||
              userId !== tuple.userId ||
              source !== tuple.sourceAddress ||
              destination !== tuple.destinationAddress
            }
            onClick={() => {
              void session.adopt(view.receipt, {
                userId,
                source,
                destination,
                ownershipConfirmed,
              });
              setOwnershipConfirmed(false);
            }}
          >
            {t('adopt')}
          </Button>
        </>
      ) : view.kind !== 'idle' ? (
        <output className="block text-sm">{t(view.kind)}</output>
      ) : null}
    </section>
  );
}
