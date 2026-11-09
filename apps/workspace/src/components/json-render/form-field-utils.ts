const NON_ALPHANUMERIC = /[^a-z0-9]+/gi;
const EDGE_UNDERSCORES = /^_+|_+$/g;

function slugifyLabel(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/['"`]/g, '')
    .replace(NON_ALPHANUMERIC, '_')
    .replace(EDGE_UNDERSCORES, '');
}

export function deriveFormFieldName(
  name: unknown,
  label: unknown,
  fallbackPrefix = 'field'
): string {
  if (typeof name === 'string' && name.trim().length > 0) return name.trim();

  if (typeof label === 'string' && label.trim().length > 0) {
    const slug = slugifyLabel(label);
    if (slug.length > 0) return slug;
  }

  return `${fallbackPrefix}_input`;
}

export function normalizeTextControlValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value == null) return '';
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value
      .map((item) =>
        typeof item === 'string' ||
        typeof item === 'number' ||
        typeof item === 'boolean'
          ? String(item)
          : ''
      )
      .filter(Boolean)
      .join(', ');
  }
  if (typeof value === 'object') {
    if ('value' in value) {
      const inner = (value as { value?: unknown }).value;
      if (
        typeof inner === 'string' ||
        typeof inner === 'number' ||
        typeof inner === 'boolean'
      ) {
        return String(inner);
      }
    }
    return '';
  }
  return '';
}
