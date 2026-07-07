import type { Metadata } from 'next';

export const dynamic = 'force-static';
export const revalidate = false;

export const metadata: Metadata = {
  title: 'Sign In to Tuturuuu',
  description:
    'Access your Tuturuuu workspace and continue where you left off.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
