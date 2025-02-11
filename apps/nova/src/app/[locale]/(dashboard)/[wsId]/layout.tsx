import { Sidebar } from '@/components/layout/sidebar';
import { Toaster } from '@tutur3u/ui/toaster';
import type { Metadata } from 'next';
import { ThemeProvider } from 'next-themes';
import { Inter } from 'next/font/google';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Prompt Engineering Playground',
  description: 'Experiment with AI prompts and challenges',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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
          <Sidebar />
          <main className="flex-1 overflow-y-auto">{children}</main>
        </div>
        <Toaster />
      </ThemeProvider>
    </div>
  );
}
