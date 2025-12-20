'use client';

import {
  Bell,
  ChevronRight,
  CreditCard,
  Settings,
  Shield,
  Smartphone,
  User,
  Users,
} from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';

const settingsNav = [
  {
    key: 'profile',
    href: '/settings/account',
    icon: User,
  },
  {
    key: 'security',
    href: '/settings/account/security',
    icon: Shield,
  },
  {
    key: 'sessions',
    href: '/settings/account/sessions',
    icon: Smartphone,
  },
  {
    key: 'notifications',
    href: '/settings/account/notifications',
    icon: Bell,
  },
  {
    key: 'billing',
    href: '/settings/account/billing',
    icon: CreditCard,
  },
  {
    key: 'accounts',
    href: '/settings/account/accounts',
    icon: Users,
  },
  {
    key: 'workspaces',
    href: '/settings/account/workspaces',
    icon: Settings,
  },
] as const;

interface SettingsNavProps {
  className?: string;
}

export default function SettingsNav({ className }: SettingsNavProps) {
  const t = useTranslations('settings-nav');
  const pathname = usePathname();

  return (
    <nav className={cn('space-y-1', className)}>
      {settingsNav.map((item) => {
        const isActive = pathname === item.href;
        const Icon = item.icon;

        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'group relative flex items-center justify-between rounded-lg bg-background px-3 py-3 font-medium text-sm transition-all duration-200 ease-in-out',
              'hover:scale-[1.02] hover:shadow-sm active:scale-[0.98]',
              isActive
                ? 'border border-dynamic-blue/40 bg-dynamic-blue/15 text-dynamic-blue shadow-sm ring-1 ring-dynamic-blue/20'
                : 'border border-transparent text-foreground hover:border-dynamic-border hover:bg-foreground/8 hover:text-foreground'
            )}
          >
            <div className="flex min-w-0 flex-1 items-center space-x-3">
              <div
                className={cn(
                  'shrink-0 rounded-md p-1.5 transition-colors',
                  isActive
                    ? 'bg-dynamic-blue/20 text-dynamic-blue'
                    : 'bg-foreground/10 text-foreground group-hover:bg-foreground/20 group-hover:text-foreground'
                )}
              >
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div
                  className={cn(
                    'truncate font-semibold',
                    isActive ? 'text-dynamic-blue' : 'text-foreground'
                  )}
                >
                  {t(`${item.key}.name`)}
                </div>
                <div
                  className={cn(
                    'mt-0.5 line-clamp-2 text-xs leading-tight',
                    isActive
                      ? 'text-dynamic-blue/70'
                      : 'text-foreground/70 group-hover:text-foreground'
                  )}
                >
                  {t(`${item.key}.description`)}
                </div>
              </div>
            </div>

            <ChevronRight
              className={cn(
                'h-4 w-4 shrink-0 transition-all duration-200 ease-in-out',
                isActive
                  ? 'translate-x-0.5 text-dynamic-blue'
                  : 'text-foreground/40 group-hover:translate-x-0.5 group-hover:text-foreground'
              )}
            />
          </Link>
        );
      })}
    </nav>
  );
}
