'use client';

import { Sidebar } from '@/components/layout/sidebar';
import { Toaster } from '@tuturuuu/ui/toaster';
import { ThemeProvider } from 'next-themes';
import { Inter } from 'next/font/google';
import { usePathname } from 'next/navigation';

const inter = Inter({ subsets: ['latin'] });

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathName = usePathname();

  const SIDEBAR_HIDDEN_ROUTES = ['/login', '/signup'];
  const SIDEBAR_HIDDEN_ROUTE_PATTERNS = [
    /^\/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\/challenges\/\d+$/, // Matches UUID/challenges/{id}
  ];

  const shouldShowSidebar = !(
    SIDEBAR_HIDDEN_ROUTES.includes(pathName) ||
    SIDEBAR_HIDDEN_ROUTE_PATTERNS.some((pattern) => pattern.test(pathName))
  );

  return (
    <div className={`${inter.className} bg-background text-foreground`}>
      <ThemeProvider
        attribute="class"
        defaultTheme="dark"
        themes={['system', 'light', 'dark']}
        enableColorScheme={false}
        enableSystem
      >
        <div className="flex h-screen overflow-hidden">
          {shouldShowSidebar && <Sidebar />}
          <main className="flex-1 overflow-y-auto">{children}</main>
        </div>
        <Toaster />
      </ThemeProvider>
    </div>
  );
}
