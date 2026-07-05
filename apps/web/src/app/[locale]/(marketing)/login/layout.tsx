import type { Metadata } from 'next';
import { connection } from 'next/server';

export const metadata: Metadata = {
  title: 'Sign In to Tuturuuu',
  description:
    'Access your Tuturuuu workspace and continue where you left off.',
};

export default async function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await connection();

  return children;
}
