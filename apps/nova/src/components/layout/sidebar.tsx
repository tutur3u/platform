'use client';

import { LogoutDropdownItem } from '../logout-dropdown-item';
import { Button } from '@tuturuuu/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@tuturuuu/ui/collapsible';
import { ThemeToggle } from '@tuturuuu/ui/custom/theme-toggle';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import { cn } from '@tuturuuu/utils/format';
import {
  BookOpen,
  ChevronDown,
  Code,
  Home,
  Settings,
  Trophy,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const sidebarItems = [
  { name: 'Home', href: '/', icon: Home },
  {
    name: 'Learn',
    href: '/learn',
    icon: BookOpen,
    subItems: [
      { name: 'Introduction', href: '/learn/introduction' },
      { name: 'Basic Techniques', href: '/learn/basic-techniques' },
      { name: 'Advanced Strategies', href: '/learn/advanced-strategies' },
      { name: 'Best Practices', href: '/learn/best-practices' },
    ],
  },
  { name: 'Challenges', href: '/challenges', icon: Code },
  { name: 'Leaderboard', href: '/leaderboard', icon: Trophy },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <div className="flex w-64 flex-col border-r bg-card text-card-foreground">
      <div className="p-4">
        <h1 className="text-xl font-bold">Prompt Engineering</h1>
      </div>
      <ScrollArea className="flex-1">
        <nav className="space-y-2 p-4">
          {sidebarItems.map((item) => (
            <div key={item.href}>
              {item.subItems ? (
                <Collapsible>
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" className="w-full justify-between">
                      <span className="flex items-center">
                        <item.icon className="mr-2 h-4 w-4" />
                        {item.name}
                      </span>
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="ml-4 space-y-2">
                    {item.subItems.map((subItem) => (
                      <Link key={subItem.href} href={subItem.href}>
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
                    ))}
                  </CollapsibleContent>
                </Collapsible>
              ) : (
                <Link href={item.href}>
                  <Button
                    variant="ghost"
                    className={cn(
                      'w-full justify-start',
                      pathname === item.href &&
                        'bg-accent text-accent-foreground'
                    )}
                  >
                    <item.icon className="mr-2 h-4 w-4" />
                    {item.name}
                  </Button>
                </Link>
              )}
            </div>
          ))}
        </nav>
      </ScrollArea>
      <div className="flex items-center justify-between border-t p-4">
        <ThemeToggle />
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <Settings className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-full">
            <LogoutDropdownItem />
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
