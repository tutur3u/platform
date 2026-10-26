import { Button } from '@tuturuuu/ui/button';
import Link from 'next/link';

type CycleEmptyLineProps = {
  text: string;
  actionLabel: string;
} & (
  | { href: string; onAction?: never }
  | { onAction: () => void; href?: never }
);

/** An empty or error state: one line and one action. */
export function CycleEmptyLine({
  text,
  actionLabel,
  href,
  onAction,
}: CycleEmptyLineProps) {
  return (
    <div className="flex items-center gap-3 px-2 py-6 text-muted-foreground text-sm">
      <span>{text}</span>
      {href ? (
        <Button asChild variant="outline" size="sm" className="h-7">
          <Link href={href}>{actionLabel}</Link>
        </Button>
      ) : (
        <Button variant="outline" size="sm" className="h-7" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
