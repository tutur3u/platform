'use client';

import { useTranslations } from 'next-intl';
import { Label } from '../../../label';
import { Switch } from '../../../switch';
import {
  createContext,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  useContext,
} from 'react';
import { type PendingGuest, GuestAdder } from './guest-adder';
import { GuestRow } from './guest-row';

type PendingGuestsState = {
  guests: PendingGuest[];
  setGuests: Dispatch<SetStateAction<PendingGuest[]>>;
  addMeet: boolean;
  setAddMeet: Dispatch<SetStateAction<boolean>>;
};

const PendingGuestsContext = createContext<PendingGuestsState | null>(null);

/** Holds guests chosen for an unsaved event until it is created. */
export function PendingGuestsProvider({
  value,
  children,
}: {
  value: PendingGuestsState;
  children: ReactNode;
}) {
  return (
    <PendingGuestsContext.Provider value={value}>
      {children}
    </PendingGuestsContext.Provider>
  );
}

export function usePendingGuests() {
  return useContext(PendingGuestsContext);
}

/** Guests for a new Tuturuuu event; invited right after it is created. */
export function PendingNativeGuests({ workspaceId }: { workspaceId: string }) {
  const t = useTranslations('calendar.native_guests');
  const state = usePendingGuests();
  if (!state) return null;
  const { guests, setGuests, addMeet, setAddMeet } = state;
  const meetSwitchId = 'new-event-meet';
  const excludedEmails = guests.flatMap((guest) =>
    guest.email ? [guest.email] : []
  );

  return (
    <section className="space-y-2" aria-label={t('title')}>
      <div className="flex items-center gap-2">
        <Switch
          id={meetSwitchId}
          checked={addMeet}
          onCheckedChange={(checked) => setAddMeet(checked === true)}
        />
        <Label htmlFor={meetSwitchId} className="font-normal text-sm">
          {t('meet_toggle')}
        </Label>
      </div>
      <p className="font-medium text-sm">{t('title')}</p>
      <GuestAdder
        workspaceId={workspaceId}
        disabled={guests.length >= 50}
        excludedEmails={excludedEmails}
        onAdd={(guest) =>
          setGuests((previous) =>
            previous.some((existing) => existing.key === guest.key)
              ? previous
              : [...previous, guest]
          )
        }
      />
      {guests.length > 0 && (
        <ul className="divide-y">
          {guests.map((guest) => (
            <GuestRow
              key={guest.key}
              label={guest.label}
              email={guest.email}
              isOptional={guest.input.optional === true}
              onToggleOptional={() =>
                setGuests((previous) =>
                  previous.map((item) =>
                    item.key === guest.key
                      ? {
                          ...item,
                          input: {
                            ...item.input,
                            optional: !item.input.optional,
                          },
                        }
                      : item
                  )
                )
              }
              onRemove={() =>
                setGuests((previous) =>
                  previous.filter((item) => item.key !== guest.key)
                )
              }
            />
          ))}
        </ul>
      )}
    </section>
  );
}
