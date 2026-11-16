import '@tuturuuu/ui/globals.css';
import type { ReactNode } from 'react';
import { PlaygroundCommandCenter } from '@/components/playground-command-center';

export const metadata = {
  title: 'Playground · Tuturuuu',
  description: 'Try Tuturuuu products with an interactive demo workspace.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-ui="sorbet">
      <body>{children}</body>
    </html>
  );
}
