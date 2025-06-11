'use client';

import { cn } from '@tuturuuu/utils/format';
import {
  Bell,
  ChevronRight,
  CreditCard,
  Settings,
  Shield,
  Smartphone,
  User,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const settingsNav = [
  {
    name: 'Profile & Contact',
    href: '/settings/account',
    icon: User,
    description: 'Manage your personal information and contact details',
  },
  {
    name: 'Security',
    href: '/settings/account/security',
    icon: Shield,
    description: 'Password, two-factor authentication, and security settings',
  },
  {
    name: 'Sessions',
    href: '/settings/account/sessions',
    icon: Smartphone,
    description: 'Manage your active sessions and device logins',
  },
  {
    name: 'Notifications',
    href: '/settings/account/notifications',
    icon: Bell,
    description: 'Control how and when you receive notifications',
  },
  {
    name: 'Billing & Plan',
    href: '/settings/account/billing',
    icon: CreditCard,
    description: 'Subscription, payment methods, and billing history',
  },
  {
    name: 'Workspaces',
    href: '/settings/account/workspaces',
    icon: Settings,
    description: 'Manage your workspace settings and preferences',
  },
];

interface SettingsNavProps {
  className?: string;
}

export default function SettingsNav({ className }: SettingsNavProps) {
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
              'group relative flex items-center justify-between rounded-lg bg-background px-3 py-3 text-sm font-medium transition-all duration-200 ease-in-out',
              'hover:scale-[1.02] hover:shadow-sm active:scale-[0.98]',
              isActive
                ? 'border border-dynamic-blue/40 bg-dynamic-blue/15 text-dynamic-blue shadow-sm ring-1 ring-dynamic-blue/20'
                : 'hover:border-dynamic-border hover:text-dynamic-foreground border border-transparent text-foreground hover:bg-foreground/8'
            )}
          >
            <div className="flex min-w-0 flex-1 items-center space-x-3">
              <div
                className={cn(
                  'flex-shrink-0 rounded-md p-1.5 transition-colors',
                  isActive
                    ? 'bg-dynamic-blue/20 text-dynamic-blue'
                    : 'group-hover:text-dynamic-foreground bg-foreground/10 text-foreground group-hover:bg-foreground/20'
                )}
              >
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div
                  className={cn(
                    'truncate font-semibold',
                    isActive ? 'text-dynamic-blue' : 'text-dynamic-foreground'
                  )}
                >
                  {item.name}
                </div>
                <div
                  className={cn(
                    'mt-0.5 line-clamp-2 text-xs leading-tight',
                    isActive
                      ? 'text-dynamic-blue/70'
                      : 'text-foreground/70 group-hover:text-foreground'
                  )}
                >
                  {item.description}
                </div>
              </div>
            </div>

            <ChevronRight
              className={cn(
                'h-4 w-4 flex-shrink-0 transition-all duration-200 ease-in-out',
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
