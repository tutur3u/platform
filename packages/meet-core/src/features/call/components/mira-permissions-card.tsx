'use client';

import { Ban, Check, ShieldCheck, TriangleAlert } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Switch } from '@tuturuuu/ui/switch';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';

const capabilities = ['draft', 'editDocs', 'suggestCode'] as const;
type Capability = (typeof capabilities)[number];

export type MiraPermissionsProps = {
  enabled?: Readonly<Record<Capability, boolean>>;
  onToggle?: (capability: Capability, enabled: boolean) => Promise<void>;
};

export function MiraPermissionsCard({
  enabled,
  onToggle,
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
      className={cn('rounded-xl border bg-muted/25 p-3', className)}
    >
      <header className="mb-2 flex flex-wrap items-center gap-2">
        <ShieldCheck aria-hidden className="size-4 text-dynamic-purple" />
        <h3 className="font-semibold text-sm">{t('title')}</h3>
        <span className="ms-auto text-muted-foreground text-xs">
          {t('host')}
        </span>
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
        <li className="flex items-center gap-2">
          <span className="flex-1">{t('readPrivate')}</span>
          <Badge
            variant="outline"
            className="gap-1 rounded-full border-destructive/30 bg-calendar-bg-red text-destructive"
          >
            <Ban aria-hidden className="size-3.5 shrink-0" />
            {t('blocked')}
          </Badge>
        </li>
      </ul>
      {phase === 'error' && (
        <p role="alert" className="mt-2 text-destructive text-xs">
          {t('failed')}
        </p>
      )}
    </section>
  );
}
