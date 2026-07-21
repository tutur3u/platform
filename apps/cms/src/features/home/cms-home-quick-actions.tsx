import { ArrowRight, Eye, FileText, PenSquare, Users } from '@tuturuuu/icons';
import Link from 'next/link';
import type { ReactNode } from 'react';

interface QuickAction {
  description: string;
  href: string;
  icon: ReactNode;
  title: string;
}

export function CmsHomeQuickActions({
  actions,
}: {
  actions: Array<Omit<QuickAction, 'icon'> & { kind: QuickActionKind }>;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {actions.map((action) => (
        <Link
          key={action.href}
          href={action.href}
          className="group flex min-h-28 items-start gap-3 rounded-lg border border-border/70 bg-background/60 p-4 transition-colors hover:border-foreground/20 hover:bg-background"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-card text-muted-foreground transition-colors group-hover:text-foreground">
            {quickActionIcons[action.kind]}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-medium text-sm">{action.title}</span>
            <span className="mt-1 block text-muted-foreground text-sm leading-5">
              {action.description}
            </span>
          </span>
          <ArrowRight className="mt-2 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
        </Link>
      ))}
    </div>
  );
}

type QuickActionKind = 'content' | 'members' | 'pages' | 'preview';

const quickActionIcons: Record<QuickActionKind, ReactNode> = {
  content: <FileText className="size-4" />,
  members: <Users className="size-4" />,
  pages: <PenSquare className="size-4" />,
  preview: <Eye className="size-4" />,
};
