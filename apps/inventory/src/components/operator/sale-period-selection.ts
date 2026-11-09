type Period = { id: string; status: string };
type PeriodStorage = Pick<Storage, 'getItem' | 'setItem'>;

export type SalePeriodSelection = {
  wsId: string;
  actorId: string;
  id: string;
};

function storageKey(wsId: string, actorId: string) {
  return `inventory:sale-period:${JSON.stringify([wsId, actorId])}`;
}

export function browserSalePeriodStorage(): PeriodStorage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.sessionStorage;
  } catch {
    return undefined;
  }
}

export function rememberSalePeriod(
  selection: SalePeriodSelection,
  storage: PeriodStorage | undefined
) {
  if (!selection.wsId || !selection.actorId) return;
  try {
    storage?.setItem(
      storageKey(selection.wsId, selection.actorId),
      selection.id
    );
  } catch {
    // In-memory selection still supports consecutive sales when storage is blocked.
  }
}

export function resolveSalePeriod({
  wsId,
  actorId,
  current,
  periods,
  fallback,
  storage,
}: {
  wsId: string;
  actorId: string;
  current: SalePeriodSelection | null;
  periods: Period[];
  fallback: string;
  storage: PeriodStorage | undefined;
}) {
  let saved: string | null = null;
  if (current?.wsId === wsId && current.actorId === actorId) {
    saved = current.id;
  } else if (wsId && actorId) {
    try {
      saved = storage?.getItem(storageKey(wsId, actorId)) ?? null;
    } catch {
      // Storage availability must not prevent checkout.
    }
  }
  if (
    saved !== null &&
    (saved === 'none' ||
      periods.some(
        (period) => period.id === saved && period.status === 'active'
      ))
  ) {
    return saved;
  }
  return fallback;
}
