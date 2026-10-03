import { useQuery } from '@tanstack/react-query';
import {
  getGoogleCalendarColorOptions,
  type CalendarSourceOption,
} from '@tuturuuu/internal-api';
import type { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { createCalendarDraftRecovery } from './calendar-draft-recovery';
import { eventSavePayload } from './event-save-payload';

type Draft = Partial<CalendarEvent>;
type SaveArgs = {
  draft: Draft;
  original?: CalendarEvent;
  buildPayload: () => Draft;
  addEvent: (
    event: Omit<CalendarEvent, 'id'>,
    options?: { requestId?: string }
  ) => Promise<CalendarEvent | undefined>;
  updateEvent: (id: string, payload: Draft) => Promise<unknown>;
  closeModal: () => void;
  setIsSaving: (saving: boolean) => void;
  onError: () => void;
  isSaving: boolean;
  source?: CalendarSourceOption;
  wsId?: string;
};

export function useCalendarDraftSave(args: SaveArgs) {
  const t = useTranslations('calendar');
  const connectionId =
    args.source?.provider === 'google' ? args.source.connectionId : null;
  const { data: capabilities } = useQuery({
    queryKey: ['google-calendar-color-options', args.wsId, connectionId],
    enabled: !!args.wsId && !!connectionId,
    queryFn: () => getGoogleCalendarColorOptions(args.wsId!, connectionId!),
  });
  const scope = `${args.draft.ws_id}:${args.draft.requestId ?? args.original?.id}`;
  const state = useRef({ scope, recovery: createCalendarDraftRecovery() });
  if (state.current.scope !== scope)
    state.current = { scope, recovery: createCalendarDraftRecovery() };
  const [uncertainScope, setUncertainScope] = useState<string>();
  const current = state.current;
  const recovery = current.recovery;
  const uncertain = uncertainScope === scope && !recovery.original();

  async function retryOriginal() {
    const submission = recovery.submitted();
    if (!submission?.recoverable) return;
    args.setIsSaving(true);
    try {
      const saved = await args.addEvent(
        submission.payload as Omit<CalendarEvent, 'id'>,
        {
          requestId: submission.requestId,
        }
      );
      if (!saved) throw new Error('Unconfirmed creation');
      if (state.current !== current) return;
      recovery.complete(saved);
      // The caller may have edited the draft during the uncertain response.
      // Keep those edits open; their next save updates the confirmed event ID.
      setUncertainScope(undefined);
    } catch {
      if (state.current === current) args.onError();
    } finally {
      if (state.current === current) args.setIsSaving(false);
    }
  }

  async function save() {
    if (uncertain) return;
    args.setIsSaving(true);
    try {
      const payload = args.buildPayload();
      const confirmed = recovery.original();
      if (confirmed) {
        const sourceChanged =
          JSON.stringify(payload.source) !==
          JSON.stringify(recovery.submitted()?.payload.source);
        const updates = eventSavePayload(payload, confirmed, sourceChanged);
        if (Object.keys(updates).length)
          await args.updateEvent(confirmed.id, updates);
      } else if (args.original?.id === 'new') {
        if (!args.draft.requestId)
          throw new Error('Missing creation request ID');
        const submission = recovery.capture(
          payload,
          args.draft.requestId,
          !!connectionId &&
            capabilities?.connectionId === connectionId &&
            capabilities.providerColorWrites === true
        );
        const saved = await args.addEvent(
          submission.payload as Omit<CalendarEvent, 'id'>,
          {
            requestId: submission.requestId,
          }
        );
        if (!saved) throw new Error('Unconfirmed creation');
        recovery.complete(saved);
      } else if (args.original?.id) {
        if (Object.keys(payload).length)
          await args.updateEvent(args.original.id, payload);
      } else throw new Error('No event to save');
      if (state.current === current) args.closeModal();
    } catch {
      if (recovery.submitted() && !recovery.original())
        setUncertainScope(scope);
      if (state.current === current) args.onError();
    } finally {
      if (state.current === current) args.setIsSaving(false);
    }
  }

  return {
    save,
    recoveryNotice: uncertain ? (
      <div role="status" className="mb-2 space-y-2">
        <p className="text-muted-foreground text-sm">
          {t(
            recovery.submitted()?.recoverable
              ? 'creation_recovery_notice'
              : 'creation_recovery_unavailable'
          )}
        </p>
        {recovery.submitted()?.recoverable && (
          <Button
            variant="outline"
            onClick={retryOriginal}
            disabled={args.isSaving}
          >
            {t('creation_recovery_retry')}
          </Button>
        )}
      </div>
    ) : null,
  };
}
