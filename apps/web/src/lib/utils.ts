import { cn } from '@repo/ui/lib/utils';

const capitalize = (s?: string | null) => {
  if (!s) return '';
  if (s.length === 0) return s;
  if (s.length === 1) return s.toUpperCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
};

export { capitalize, cn };
