import '../styles/globals.css';

import { ThemeProvider } from '@/components/theme-provider';
import { Toaster } from '@/components/ui/toaster';
import { StaffToolbar } from './staff-toolbar';
import { Suspense } from 'react';
import { cn } from '@/lib/utils';

export const metadata = {
  title: 'Tuturuuu',
  description:
    'Brainstorm and organize your ideas at the speed of thought, supercharged by AI.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body
        className={cn(
          'bg-background min-h-screen font-sans antialiased'
          // fontSans.variable
        )}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          disableTransitionOnChange
          enableSystem
        >
          <div className="relative flex min-h-screen flex-col">
            <div className="flex-1">{children}</div>
          </div>
        </ThemeProvider>

        <Suspense>
          <StaffToolbar />
        </Suspense>
        <Suspense>
          <Toaster />
        </Suspense>
      </body>
    </html>
  );
}
