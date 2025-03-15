'use client';

import { Button } from '@tuturuuu/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@tuturuuu/ui/collapsible';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import { ChevronDown } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface NavItem {
  name: string;
  href: string;
  icon: React.ReactNode;
  requiresAdmin?: boolean;
  subItems?: { name: string; href: string }[];
}

interface NavProps {
  isAdmin: boolean;
  isCollapsed: boolean;
  navItems: NavItem[];
  onClick?: () => void;
}

export function Nav({ isAdmin, isCollapsed, navItems, onClick }: NavProps) {
  const pathname = usePathname();

  return (
    <nav className={cn('grid gap-1 p-2', isCollapsed && 'justify-center')}>
      {navItems
        .filter((item) => (isAdmin ? item : !item.requiresAdmin))
        .map((item) => (
          <div key={item.href}>
            {item.subItems && item.subItems.length ? (
              <Collapsible>
                <CollapsibleTrigger asChild>
                  {isCollapsed ? (
                    <Tooltip delayDuration={0}>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" className="h-9 w-9">
                          {item.icon}
                          <span className="sr-only">{item.name}</span>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent
                        side="right"
                        className="flex items-center gap-4 border bg-background text-foreground"
                      >
                        {item.name}
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    <Button variant="ghost" className="w-full justify-between">
                      <span className="flex items-center gap-2">
                        {item.icon}
                        {item.name}
                      </span>
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                  )}
                </CollapsibleTrigger>
                <CollapsibleContent
                  className={cn('space-y-2', isCollapsed ? 'ml-0' : 'ml-4')}
                >
                  {item.subItems.map((subItem) =>
                    isCollapsed ? (
                      <Tooltip key={subItem.href} delayDuration={0}>
                        <TooltipTrigger asChild>
                          <Link href={subItem.href} onClick={onClick}>
                            <Button
                              variant={
                                pathname === subItem.href
                                  ? 'secondary'
                                  : 'ghost'
                              }
                              className={cn(
                                'h-9 w-9',
                                pathname === subItem.href &&
                                  'bg-accent text-accent-foreground'
                              )}
                            >
                              <div className="h-4 w-4" />
                              <span className="sr-only">{subItem.name}</span>
                            </Button>
                          </Link>
                        </TooltipTrigger>
                        <TooltipContent
                          side="right"
                          className="flex items-center gap-4 border bg-background text-foreground"
                        >
                          {subItem.name}
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      <Link
                        key={subItem.href}
                        href={subItem.href}
                        onClick={onClick}
                      >
                        <Button
                          variant="ghost"
                          className={cn(
                            'w-full justify-start',
                            pathname === subItem.href &&
                              'bg-accent text-accent-foreground'
                          )}
                        >
                          {subItem.name}
                        </Button>
                      </Link>
                    )
                  )}
                </CollapsibleContent>
              </Collapsible>
            ) : isCollapsed ? (
              <Tooltip delayDuration={0}>
                <TooltipTrigger asChild>
                  <Link href={item.href} onClick={onClick}>
                    <Button
                      variant={pathname === item.href ? 'secondary' : 'ghost'}
                      className={cn(
                        'h-9 w-9',
                        pathname === item.href &&
                          'bg-accent text-accent-foreground'
                      )}
                    >
                      {item.icon}
                      <span className="sr-only">{item.name}</span>
                    </Button>
                  </Link>
                </TooltipTrigger>
                <TooltipContent
                  side="right"
                  className="flex items-center gap-4 border bg-background text-foreground"
                >
                  {item.name}
                </TooltipContent>
              </Tooltip>
            ) : (
              <Link href={item.href} onClick={onClick}>
                <Button
                  variant={pathname === item.href ? 'secondary' : 'ghost'}
                  className={cn(
                    'w-full justify-start gap-2',
                    pathname === item.href && 'bg-accent text-accent-foreground'
                  )}
                >
                  {item.icon}
                  {item.name}
                </Button>
              </Link>
            )}
          </div>
        ))}
    </nav>
  );
}
