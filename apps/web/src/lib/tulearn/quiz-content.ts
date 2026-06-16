export type MatchingPair = {
  left: string;
  right: string;
};

export function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function displayText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return '';
}

export function getArrayProperty(value: unknown, key: string): unknown[] {
  const property = asRecord(value)?.[key];
  return Array.isArray(property) ? property : [];
}

export function getStringItems(value: unknown, key: string): string[] {
  return getArrayProperty(value, key).map(displayText);
}

export function getMatchingPairs(value: unknown): MatchingPair[] {
  const pairs = Array.isArray(value) ? value : getArrayProperty(value, 'pairs');

  return pairs
    .map((pair) => {
      const record = asRecord(pair);
      return {
        left: displayText(record?.left),
        right: displayText(record?.right),
      };
    })
    .filter((pair) => pair.left && pair.right);
}
