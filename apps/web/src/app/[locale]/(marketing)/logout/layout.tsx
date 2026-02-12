import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Log Out',
  description: 'Log out of your Tuturuuu account.',
};

export default function LogoutLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
