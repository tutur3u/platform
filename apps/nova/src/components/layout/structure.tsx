'use client';

import { Sidebar } from '@/components/layout/sidebar';
import { Button } from '@tuturuuu/ui/button';
import { cn } from '@tuturuuu/utils/format';
import { Menu, X } from 'lucide-react';
import { usePathname } from 'next/navigation';
import React, { useEffect, useState } from 'react';

interface NavItem {
  name: string;
  href: string;
  icon: React.ReactNode;
  requiresAdmin?: boolean;
  subItems?: { name: string; href: string }[];
}

interface StructureProps {
  children: React.ReactNode;
  isAdmin: boolean;
  navItems: NavItem[];
}

export default function Structure({
  children,
  isAdmin,
  navItems,
}: StructureProps) {
  const [isCollapsed, setIsCollapsed] = useState(true);
  const pathname = usePathname();

  // Find current page title based on pathname
  const currentPage = navItems.find(
    (item) =>
      pathname === item.href ||
      pathname.startsWith(item.href + '/') ||
      item.subItems?.some((subItem) => pathname === subItem.href)
  );
  const pageTitle = currentPage?.name || 'Dashboard';

  // Check if we're on mobile when component mounts
  useEffect(() => {
    const isMobile = window.innerWidth < 768;
    setIsCollapsed(isMobile);

    // Optional: Save and restore sidebar state from localStorage
    const savedState = localStorage.getItem('sidebarCollapsed');
    if (savedState) {
      setIsCollapsed(savedState === 'true');
    }

    // Handle window resize events
    const handleResize = () => {
      if (window.innerWidth < 768) {
        setIsCollapsed(true);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Save sidebar state when it changes
  useEffect(() => {
    localStorage.setItem('sidebarCollapsed', isCollapsed.toString());
  }, [isCollapsed]);

  return (
    <>
      {/* Mobile navbar - visible only on small screens */}
      <nav className="bg-background/70 fixed z-10 flex w-full flex-none items-center justify-between gap-2 border-b px-4 py-2 backdrop-blur-lg md:hidden">
        <div className="flex h-[52px] items-center gap-2">
          <span className="text-lg font-semibold">{pageTitle}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="icon"
            variant="outline"
            className="h-auto w-auto flex-none rounded-lg p-2 md:hidden"
            onClick={() => setIsCollapsed(!isCollapsed)}
          >
            <Menu className="h-5 w-5" />
          </Button>
        </div>
      </nav>

      <div className="flex h-screen overflow-hidden">
        {/* Sidebar with responsive behavior */}
        <div
          className={cn(
            'bg-background/70 fixed inset-0 z-20 flex flex-col overflow-y-auto border-r backdrop-blur-lg transition-transform duration-300 ease-in-out md:static md:w-64 md:bg-transparent',
            isCollapsed
              ? 'translate-x-[-100%] md:translate-x-0'
              : 'translate-x-0'
          )}
        >
          {/* Close button for mobile view */}
          <div className="flex items-center justify-between p-4 md:hidden">
            <span className="font-semibold">Menu</span>
            <Button
              size="icon"
              variant="ghost"
              className="h-auto w-auto flex-none rounded-lg p-2"
              onClick={() => setIsCollapsed(true)}
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          <Sidebar isAdmin={isAdmin} className="flex-1" navItems={navItems} />
        </div>

        {/* Main content with responsive padding */}
        <main className="bg-background flex-1 overflow-y-auto p-4 pt-20 md:pt-4 lg:px-8">
          {children}
        </main>
      </div>
    </>
  );
}
