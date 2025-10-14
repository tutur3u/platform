import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sign In to Tuturuuu',
  description:
    'Access your Tuturuuu workspace and continue where you left off.',
};

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
