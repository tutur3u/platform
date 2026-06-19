'use client';

import { BookText } from '@tuturuuu/icons/lucide-static';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { useNavigation } from './shared/navigation-config';

export function MainNavigationMenu() {
  const t = useTranslations();
  const { categories } = useNavigation(t);

  const mainLinks = categories.find((cat) => cat.title === 'main')?.items || [];
  const resources =
    categories.find((cat) => cat.title === 'resources')?.items || [];

  return (
    <nav className="flex w-full max-w-none">
      <div className="flex w-full items-center justify-between">
        {mainLinks.map((item) => {
          if (item.href === `/`) return null;

          return (
            <a
              key={item.href}
              href={item.href}
              className={cn(
                marketingNavTriggerClassName,
                'bg-transparent px-6 font-semibold transition-all duration-300 hover:bg-foreground/5'
              )}
            >
              <span className="flex items-center gap-2">{item.label}</span>
            </a>
          );
        })}

        <div className="group relative">
          <button
            type="button"
            className={cn(
              marketingNavTriggerClassName,
              'group bg-transparent font-semibold transition-all duration-300 hover:bg-foreground/5'
            )}
          >
            {t('common.resources')}
          </button>
          <div className="invisible absolute top-full right-0 z-50 mt-2 w-[800px] rounded-md border bg-popover p-0 text-popover-foreground opacity-0 shadow-lg transition group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
            <ul className="grid w-full gap-3 bg-linear-to-br from-background via-background/95 to-background/90 p-6 backdrop-blur-sm md:grid-cols-2">
              <li className="col-span-full mb-2 rounded-xl border bg-card p-4 text-card-foreground shadow-sm">
                <div className="flex items-center gap-2 font-medium text-sm">
                  <BookText className="h-4 w-4" />
                  <span>Learning Resources</span>
                </div>
              </li>
              {resources.map((resource) => (
                <ListItem
                  key={resource.href}
                  title={resource.label}
                  href={resource.href}
                  icon={resource.icon}
                  badge={resource.badge}
                >
                  {resource.description}
                </ListItem>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </nav>
  );
}

const marketingNavTriggerClassName =
  'inline-flex h-10 w-max items-center justify-center rounded-md px-4 py-2 text-sm ring-offset-background transition-colors focus:bg-accent focus:text-accent-foreground focus:outline-none disabled:pointer-events-none disabled:opacity-50';

function ListItem({
  children,
  className,
  href,
  title,
  icon,
  badge,
  disabled,
  ...props
}: React.ComponentPropsWithoutRef<'a'> & {
  badge?: string;
  disabled?: boolean;
  icon: ReactNode;
  title: string;
}) {
  if (!href) return null;

  return (
    <li>
      <a
        href={href}
        className={cn(
          'group relative block h-full select-none space-y-1 rounded-md border border-transparent p-4 leading-none no-underline outline-hidden transition-all duration-300',
          'opacity-90 hover:opacity-100',
          'hover:scale-[1.02] hover:border-border active:scale-[0.98]',
          disabled && 'cursor-not-allowed opacity-50',
          className
        )}
        {...props}
      >
        <div className="relative">
          <div className="flex items-center gap-2">
            <div className="text-primary transition-transform duration-300 group-hover:rotate-3 group-hover:scale-110">
              {icon}
            </div>
            <div className="font-semibold text-sm leading-none">{title}</div>
            {badge && (
              <span className="ml-auto inline-flex w-fit shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-md border border-transparent bg-secondary px-2 py-0.5 font-semibold text-secondary-foreground text-xs">
                {badge}
              </span>
            )}
          </div>
          <p className="mt-2 line-clamp-3 text-muted-foreground text-sm leading-snug opacity-80 transition-opacity duration-300 group-hover:opacity-100">
            {children}
          </p>
        </div>
      </a>
    </li>
  );
}
