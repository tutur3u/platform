const LABEL_COLOR_ALIASES: Record<string, string> = {
  amber: '#D97706',
  blue: '#2563EB',
  cyan: '#0891B2',
  emerald: '#059669',
  gray: '#6B7280',
  green: '#16A34A',
  indigo: '#4F46E5',
  orange: '#EA580C',
  pink: '#DB2777',
  purple: '#7C3AED',
  red: '#DC2626',
  slate: '#475569',
  teal: '#0D9488',
  violet: '#7C3AED',
  yellow: '#CA8A04',
};

export function normalizeLabelColor(value?: string) {
  const color = (value || 'gray').trim();

  if (/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/u.test(color)) {
    return color;
  }

  return LABEL_COLOR_ALIASES[color.toLowerCase()] ?? color;
}
