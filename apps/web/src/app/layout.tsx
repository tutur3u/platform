import { Suspense } from 'react';
import '../styles/globals.css';
import { Toaster } from '@/components/ui/toaster';
import { StaffToolbar } from './staff-toolbar';

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
    <html lang="en" className="dark">
      <body>
        <div className="min-h-screen">{children}</div>

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
