type CachedQueryEntry = readonly [readonly unknown[], unknown];

type ListPage<T> = {
  count?: number;
  data?: T[];
};

function normalizePrimitive(value: unknown) {
  return String(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLocaleLowerCase();
}

export function normalizeSearchQuery(value: string) {
  return normalizePrimitive(value).replace(/\s+/g, ' ');
}

function appendSearchableValues(
  value: unknown,
  output: string[],
  seen: WeakSet<object>,
  depth = 0
) {
  if (value == null || depth > 4) return;
  if (typeof value === 'string' || typeof value === 'number') {
    output.push(normalizePrimitive(value));
    return;
  }
  if (typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      appendSearchableValues(item, output, seen, depth + 1);
    }
    return;
  }
  for (const item of Object.values(value)) {
    appendSearchableValues(item, output, seen, depth + 1);
  }
}

export function matchesHybridSearch(value: unknown, query: string) {
  const normalizedQuery = normalizeSearchQuery(query);
  if (!normalizedQuery) return true;
  const searchableValues: string[] = [];
  appendSearchableValues(value, searchableValues, new WeakSet());
  return normalizedQuery
    .split(' ')
    .every((token) => searchableValues.some((value) => value.includes(token)));
}

function listPages<T>(value: unknown): ListPage<T>[] {
  if (!value || typeof value !== 'object') return [];
  if ('pages' in value && Array.isArray(value.pages)) {
    return value.pages.flatMap((page) => listPages<T>(page));
  }
  if ('data' in value && Array.isArray(value.data)) {
    return [value as ListPage<T>];
  }
  return [];
}

export function collectHybridSearchResults<T>({
  entries,
  getId,
  query,
  visibleItems,
}: {
  entries: CachedQueryEntry[];
  getId: (item: T) => string;
  query: string;
  visibleItems: T[];
}) {
  if (!normalizeSearchQuery(query)) return visibleItems;
  const records = new Map<string, T>();
  for (const item of visibleItems) records.set(getId(item), item);
  for (const [, cachedValue] of [...entries].reverse()) {
    for (const page of listPages<T>(cachedValue)) {
      for (const item of page.data ?? []) {
        const id = getId(item);
        if (!records.has(id)) records.set(id, item);
      }
    }
  }
  return [...records.values()].filter((item) =>
    matchesHybridSearch(item, query)
  );
}

export function hasCompleteHybridSearchCache(entries: CachedQueryEntry[]) {
  return entries.some(([queryKey, cachedValue]) => {
    if (normalizeSearchQuery(String(queryKey.at(-1) ?? ''))) return false;
    const pages = listPages<unknown>(cachedValue);
    if (pages.length === 0) return false;
    const count = pages.find((page) => typeof page.count === 'number')?.count;
    if (typeof count !== 'number') return false;
    const ids = new Set(
      pages.flatMap((page) =>
        (page.data ?? []).map((item) =>
          item && typeof item === 'object' && 'id' in item
            ? String(item.id)
            : JSON.stringify(item)
        )
      )
    );
    return ids.size >= count;
  });
}
