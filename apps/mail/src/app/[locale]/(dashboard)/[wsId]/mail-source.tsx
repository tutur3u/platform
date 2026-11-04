'use client';

import { Label } from '@tuturuuu/ui/label';
import { RadioGroup, RadioGroupItem } from '@tuturuuu/ui/radio-group';
import { useTranslations } from 'next-intl';
import { parseAsString, useQueryState } from 'nuqs';
import { createContext, type ReactNode, useContext } from 'react';

const ConnectedByDefault = createContext(false);

/** The server layout decides the default source; `?connected=` overrides it. */
export function MailSourceProvider({
  children,
  connectedByDefault,
}: {
  children: ReactNode;
  connectedByDefault: boolean;
}) {
  return (
    <ConnectedByDefault.Provider value={connectedByDefault}>
      {children}
    </ConnectedByDefault.Provider>
  );
}

export function useMailSource() {
  const connectedByDefault = useContext(ConnectedByDefault);
  const [connected, setConnected] = useQueryState(
    'connected',
    parseAsString.withDefault(connectedByDefault ? '1' : '')
  );
  return {
    source: connected ? ('connected' as const) : ('managed' as const),
    setSource: (source: 'connected' | 'managed') =>
      setConnected(source === 'connected' ? '1' : ''),
  };
}

export function MailSourceSettings() {
  const t = useTranslations('mail');
  const { setSource, source } = useMailSource();
  const options = [
    {
      description: t('source_managed_description'),
      label: t('connected_managed'),
      value: 'managed',
    },
    {
      description: t('source_connected_description'),
      label: t('connected_accounts'),
      value: 'connected',
    },
  ] as const;

  return (
    <RadioGroup
      aria-label={t('source')}
      className="grid gap-3"
      onValueChange={(value) => void setSource(value as typeof source)}
      value={source}
    >
      {options.map((option) => (
        <Label
          className="flex cursor-pointer items-start gap-3 rounded-2xl border border-dynamic p-4 has-[[data-state=checked]]:border-foreground/40 has-[[data-state=checked]]:bg-muted/40"
          htmlFor={`mail-source-${option.value}`}
          key={option.value}
        >
          <RadioGroupItem
            className="mt-0.5"
            id={`mail-source-${option.value}`}
            value={option.value}
          />
          <span className="grid gap-1">
            <span className="font-medium text-sm">{option.label}</span>
            <span className="font-normal text-muted-foreground text-sm">
              {option.description}
            </span>
          </span>
        </Label>
      ))}
    </RadioGroup>
  );
}
