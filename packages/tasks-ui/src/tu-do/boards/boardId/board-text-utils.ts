export function normalizeBoardText(value: string | null | undefined): string {
  return typeof value === 'string' ? value.toLowerCase() : '';
}

export function sortByDisplayName<T extends { name?: string | null }>(
  items: readonly T[]
): T[] {
  return [...items].sort((a, b) =>
    normalizeBoardText(a.name).localeCompare(normalizeBoardText(b.name))
  );
}
