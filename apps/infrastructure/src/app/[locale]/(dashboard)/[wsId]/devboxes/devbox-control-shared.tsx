import { Badge } from '@tuturuuu/ui/badge';
import { TableCell, TableRow } from '@tuturuuu/ui/table';
import { devboxToneClasses } from './devbox-control-utils';

export type DevboxControlTranslator = (key: string) => string;

export function ToneBadge({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: keyof typeof devboxToneClasses;
}) {
  return (
    <Badge
      className={`rounded-full border px-2 py-0.5 font-medium ${devboxToneClasses[tone].soft} ${devboxToneClasses[tone].text}`}
      variant="outline"
    >
      {children}
    </Badge>
  );
}

export function EmptyRow({
  colSpan,
  label,
}: {
  colSpan: number;
  label: string;
}) {
  return (
    <TableRow>
      <TableCell
        className="py-8 text-center text-muted-foreground"
        colSpan={colSpan}
      >
        {label}
      </TableCell>
    </TableRow>
  );
}

export function CommandBlock({ command }: { command: string }) {
  return (
    <code className="block overflow-x-auto rounded-md border border-border bg-background px-3 py-2 font-mono text-xs">
      {command}
    </code>
  );
}
