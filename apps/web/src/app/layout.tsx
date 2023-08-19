// import { Toaster } from '@ui/components/toaster';
import '../styles/globals.css';

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
        <main className="bg-background flex min-h-screen flex-col items-center">
          {children}
        </main>
        {/* <Toaster /> */}
      </body>
    </html>
  );
}
