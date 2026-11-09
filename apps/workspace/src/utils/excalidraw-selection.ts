export type SelectedElementIds = Readonly<Record<string, true>>;

export function sanitizeSelectedElementIds(
  selectedElementIds?: Record<string, boolean | undefined> | null
): SelectedElementIds | undefined {
  if (!selectedElementIds) {
    return undefined;
  }

  const normalizedEntries = Object.entries(selectedElementIds).filter(
    ([, value]) => value
  );

  if (normalizedEntries.length === 0) {
    return undefined;
  }

  return Object.fromEntries(
    normalizedEntries.map(([elementId]) => [elementId, true])
  );
}

export function getSelectionSignature(
  selectedElementIds?: Record<string, boolean | undefined> | null
): string {
  const normalizedSelection = sanitizeSelectedElementIds(selectedElementIds);

  if (!normalizedSelection) {
    return '';
  }

  return Object.keys(normalizedSelection).sort().join('|');
}
