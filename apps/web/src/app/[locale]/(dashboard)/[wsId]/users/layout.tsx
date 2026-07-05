import { connection } from 'next/server';
import type { ReactNode } from 'react';

interface UsersLayoutProps {
  children: ReactNode;
}

export default async function UsersLayout({ children }: UsersLayoutProps) {
  await connection();

  return children;
}
