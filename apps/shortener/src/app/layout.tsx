import '@tuturuuu/ui/globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Tuturuuu Link Shortener',
  description: 'Shorten your links with Tuturuuu, the best link shortener.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
