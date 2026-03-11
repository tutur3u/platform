'use client';

import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  navigationMenuTriggerStyle,
} from '@ncthub/ui/navigation-menu';
import { cn } from '@ncthub/utils/format';
import { useEffect, useRef, useState } from 'react';
import { navigationItems } from '@/config/navigation';

function useContainerWidth() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver(() => {
      setWidth(container.offsetWidth * 0.8);
    });

    resizeObserver.observe(container);

    // Initial size
    setWidth(container.offsetWidth * 0.8);

    return () => resizeObserver.disconnect();
  }, []);

  return { containerRef, width };
}

export default function MainNavigationMenu() {
  const { containerRef, width } = useContainerWidth();

  return (
    <div ref={containerRef} className="flex w-full items-center justify-center">
      <NavigationMenu
        className="scrollbar-none flex max-w-none flex-none justify-between overflow-x-auto"
        style={{ width: width ? `${width}px` : 'auto' }}
      >
        <NavigationMenuList>
          {navigationItems.map((item) => (
            <NavigationMenuItem key={item.href}>
              <NavigationMenuLink
                href={item.href}
                className={cn(
                  navigationMenuTriggerStyle(),
                  'bg-transparent px-4 transition-all duration-300 hover:bg-foreground/5'
                )}
              >
                {item.label}
              </NavigationMenuLink>
            </NavigationMenuItem>
          ))}
        </NavigationMenuList>
      </NavigationMenu>
    </div>
  );
}
