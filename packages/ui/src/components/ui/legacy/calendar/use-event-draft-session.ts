import { useEffect, useEffectEvent } from 'react';

/** Initialize a draft only on opening or switching the selected event/workspace. */
export function useEventDraftSession({
  isOpen,
  eventId,
  workspaceId,
  initialize,
}: {
  isOpen: boolean;
  eventId?: string;
  workspaceId?: string;
  initialize: () => void;
}) {
  const initializeDraft = useEffectEvent(initialize);
  // biome-ignore lint/correctness/useExhaustiveDependencies: Event and workspace identity define a new editing session.
  useEffect(() => {
    if (isOpen) initializeDraft();
  }, [isOpen, eventId, workspaceId]);
}
