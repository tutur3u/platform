'use client';

import { Ban, Check, TriangleAlert } from '@tuturuuu/icons';
import { Switch } from '@tuturuuu/ui/switch';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { MiraPrivateShareRow } from './mira-private-share';
import type { PrivateMiraShareControl } from './use-private-mira-share';

const capabilities = ['draft', 'editDocs', 'suggestCode'] as const;
type Capability = (typeof capabilities)[number];

export type MiraPermissionsProps = {
  enabled?: Readonly<Record<Capability, boolean>>;
  onToggle?: (capability: Capability, enabled: boolean) => Promise<void>;
  /** Fixed meeting rules the server enforces, rather than a host setting. */
  fixedRules?: boolean;
  /** The viewer's own share of private notes with their Private Mira. */
  privateShare?: PrivateMiraShareControl;
};

export function MiraPermissionsCard({
  enabled,
  onToggle,
  fixedRules,
  privateShare,
  className,
}: MiraPermissionsProps & { className?: string }) {
  const t = useTranslations('meet.call.miraEverywhere.permissions');
  const inFlight = useRef(false);
  const [phase, setPhase] = useState<'idle' | 'pending' | 'error'>('idle');

  async function toggle(capability: Capability, checked: boolean) {
    if (!onToggle || inFlight.current) return;
    inFlight.current = true;
    setPhase('pending');
    try {
      await onToggle(capability, checked);
      setPhase('idle');
    } catch {
      setPhase('error');
    } finally {
      inFlight.current = false;
    }
  }

  return (
    <section
      aria-label={t('title')}
      className={cn('rounded-xl border p-3', className)}
    >
      <header className="mb-2 flex items-baseline gap-2">
        <h3 className="font-medium text-sm">{t('title')}</h3>
        {!fixedRules && (
          <span className="ms-auto text-muted-foreground text-xs">
            {t('host')}
          </span>
        )}
      </header>
      <ul className="space-y-2 text-xs">
        {capabilities.map((capability) => {
          const allowed = enabled?.[capability];
          return (
            <li key={capability} className="flex min-w-0 items-center gap-2">
              {allowed !== true ? (
                <Ban
                  aria-hidden
                  className="size-3.5 shrink-0 text-muted-foreground"
                />
              ) : capability === 'suggestCode' ? (
                <TriangleAlert
                  aria-hidden
                  className="size-3.5 shrink-0 text-dynamic-orange"
                />
              ) : (
                <Check
                  aria-hidden
                  className="size-3.5 shrink-0 text-dynamic-green"
                />
              )}
              <span className="flex-1">{t(capability)}</span>
              {onToggle && allowed !== undefined ? (
                <Switch
                  aria-label={t(capability)}
                  checked={allowed}
                  disabled={phase === 'pending'}
                  className="shrink-0 motion-reduce:transition-none [&_span]:motion-reduce:transition-none"
                  onCheckedChange={(checked) =>
                    void toggle(capability, checked)
                  }
                />
              ) : (
                allowed !== true && (
                  <span className="text-muted-foreground">
                    {t(allowed === false ? 'disabled' : 'unavailable')}
                  </span>
                )
              )}
            </li>
          );
        })}
        {privateShare ? (
          <MiraPrivateShareRow share={privateShare} />
        ) : (
          <li className="flex items-center gap-2">
            <Ban
              aria-hidden
              className="size-3.5 shrink-0 text-muted-foreground"
            />
            <span className="flex-1">{t('readPrivate')}</span>
            <span className="text-muted-foreground">{t('blocked')}</span>
          </li>
        )}
      </ul>
      {phase === 'error' && (
        <p role="alert" className="mt-2 text-destructive text-xs">
          {t('failed')}
        </p>
      )}
    </section>
  );
}
