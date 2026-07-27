'use client';

import {
  Activity,
  Bot,
  ChartNoAxesCombined,
  Coins,
  Database,
  FlaskConical,
  Gauge,
  KeyRound,
  Library,
  MessagesSquare,
  Play,
  ScrollText,
  Settings2,
  Sparkles,
} from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { cn } from '@tuturuuu/utils/format';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

const navigation = [
  { href: '', icon: Gauge, key: 'overview' },
  { href: '/playground', icon: Play, key: 'playground' },
  { href: '/prompts', icon: MessagesSquare, key: 'prompts' },
  { href: '/agents', icon: Bot, key: 'agents' },
  { href: '/datasets', icon: Database, key: 'datasets' },
  { href: '/evaluations', icon: FlaskConical, key: 'evaluations' },
  { href: '/experiments', icon: Sparkles, key: 'experiments' },
  { href: '/api-keys', icon: KeyRound, key: 'api-keys' },
  { href: '/models', icon: Settings2, key: 'model-policy' },
  { href: '/runs', icon: Activity, key: 'runs' },
  { href: '/logs', icon: ScrollText, key: 'logs' },
  { href: '/usage', icon: ChartNoAxesCombined, key: 'usage' },
  { href: '/credits', icon: Coins, key: 'credits' },
] as const;

export function StudioShell({
  children,
  labels,
  workspaceId,
  workspaceName,
}: {
  children: ReactNode;
  labels: Record<string, string>;
  workspaceId: string;
  workspaceName: string;
}) {
  const pathname = usePathname();
  const root = `/${workspaceId}`;
  const currentSection =
    pathname.split('/').filter(Boolean).at(-1) === workspaceId
      ? 'overview'
      : (pathname.split('/').filter(Boolean).at(-1) ?? 'overview');

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,hsl(var(--primary)/0.08),transparent_26rem)]">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r bg-background/88 p-3 backdrop-blur-xl lg:block">
        <Link
          href={root}
          className="flex items-center gap-3 rounded-xl border bg-foreground/[0.025] p-3"
        >
          <div className="grid size-10 place-items-center rounded-xl bg-primary/12 text-primary">
            <Library className="size-5" />
          </div>
          <div className="min-w-0">
            <div className="truncate font-semibold">{labels.studio}</div>
            <div className="truncate text-muted-foreground text-xs">
              {workspaceName}
            </div>
          </div>
        </Link>
        <nav className="mt-4 space-y-1">
          {navigation.map(({ href, icon: Icon, key }) => (
            <Button
              key={key}
              asChild
              className={cn(
                'w-full justify-start gap-3',
                currentSection === (href.slice(1) || 'overview') &&
                  'bg-primary/10 text-primary'
              )}
              variant="ghost"
            >
              <Link href={`${root}${href}`}>
                <Icon className="size-4" />
                {labels[key]}
              </Link>
            </Button>
          ))}
        </nav>
      </aside>
      <main className="min-h-screen lg:pl-64">
        <div className="border-b bg-background/80 px-4 py-3 backdrop-blur-xl lg:px-8">
          <div className="flex items-center gap-2 overflow-x-auto lg:hidden">
            {navigation.slice(0, 8).map(({ href, icon: Icon, key }) => (
              <Button asChild key={key} size="sm" variant="ghost">
                <Link href={`${root}${href}`} aria-label={labels[key]}>
                  <Icon className="size-4" />
                </Link>
              </Button>
            ))}
          </div>
        </div>
        {children}
      </main>
    </div>
  );
}
