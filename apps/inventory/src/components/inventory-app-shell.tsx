import { ArrowUpRight, Boxes, LogOut } from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import type { InventoryNavLink } from '@/app/[locale]/(dashboard)/[wsId]/navigation';
import { Link } from '@/i18n/navigation';

type InventoryAppShellProps = {
  children: ReactNode;
  links: InventoryNavLink[];
  workspaceName: string;
};

export async function InventoryAppShell({
  children,
  links,
  workspaceName,
}: InventoryAppShellProps) {
  const t = await getTranslations('inventory.shell');

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <div className="border-border/70 border-b bg-dynamic-surface/70 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-dynamic-cyan/30 bg-dynamic-cyan/10 text-dynamic-cyan">
              <Boxes className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-lg leading-tight">
                {t('product')}
              </p>
              <p className="truncate text-muted-foreground text-sm">
                {t('workspace', { workspace: workspaceName })}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              className={cn(
                'inline-flex h-9 items-center gap-2 rounded-md border border-border bg-background px-3 font-medium text-sm transition hover:border-dynamic-cyan/40 hover:text-dynamic-cyan'
              )}
              href="/dashboard"
            >
              {t('switchWorkspace')}
              <ArrowUpRight className="h-4 w-4" />
            </Link>
            <form action="/api/auth/logout" method="post">
              <button
                className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-background px-3 font-medium text-sm transition hover:border-dynamic-red/40 hover:text-dynamic-red"
                type="submit"
              >
                {t('signOut')}
                <LogOut className="h-4 w-4" />
              </button>
            </form>
          </div>
        </div>
      </div>

      <div className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[280px_minmax(0,1fr)] lg:px-8">
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <nav className="grid gap-2" aria-label={t('navigationLabel')}>
            {links.map((link) => (
              <Link
                className="group rounded-lg border border-border bg-card p-3 transition hover:border-dynamic-cyan/40 hover:bg-dynamic-cyan/5"
                href={link.href}
                key={`${link.title}-${link.href}`}
              >
                <span className="flex items-center gap-2 font-medium text-sm">
                  <span className="text-muted-foreground transition group-hover:text-dynamic-cyan">
                    {link.icon}
                  </span>
                  {link.title}
                </span>
                <span className="mt-1 block text-muted-foreground text-xs leading-5">
                  {link.description}
                </span>
              </Link>
            ))}
          </nav>
        </aside>
        <main className="min-w-0">{children}</main>
      </div>
    </div>
  );
}
