import {
  FileText,
  GitCommitHorizontal,
  GitPullRequest,
  Link as LinkIcon,
  type LucideIcon,
  MessageSquare,
  RefreshCw,
} from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';

export interface FleetCardLink {
  type: string;
  label: string;
  href?: string | null;
}

const ICONS: Record<string, LucideIcon> = {
  pr: GitPullRequest,
  commit: GitCommitHorizontal,
  thread: MessageSquare,
  run: RefreshCw,
  doc: FileText,
};

const CHIP =
  'inline-flex h-[22px] max-w-40 items-center gap-1 overflow-hidden rounded-full bg-muted px-2 font-mono font-semibold text-[11.5px] text-foreground';

/** Up to `max` link chips (PR, commit, thread, run, doc), then +N. */
export function FleetLinks({
  links,
  max = 2,
  className,
}: {
  links: FleetCardLink[];
  max?: number;
  className?: string;
}) {
  if (!links.length) return null;
  const shown = links.slice(0, max);
  const extra = links.length - shown.length;
  return (
    <div className={cn('flex flex-wrap gap-1.5', className)}>
      {shown.map((link, index) => {
        const Icon = ICONS[link.type] ?? LinkIcon;
        const body = (
          <>
            <Icon aria-hidden className="size-3 shrink-0" />
            <span className="truncate">{link.label}</span>
          </>
        );
        return link.href ? (
          <a
            className={cn(
              CHIP,
              'hover:bg-foreground/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
            )}
            href={link.href}
            key={`${link.type}-${index}`}
            rel="noreferrer noopener"
            target="_blank"
          >
            {body}
          </a>
        ) : (
          <span className={CHIP} key={`${link.type}-${index}`}>
            {body}
          </span>
        );
      })}
      {extra > 0 ? (
        <span className={cn(CHIP, 'text-muted-foreground')}>+{extra}</span>
      ) : null}
    </div>
  );
}
