import type { ReactNode } from 'react';
import { Structure } from './structure';

interface RepositoryLayoutProps {
  children: ReactNode;
  params: Promise<{
    owner: string;
    repo: string;
  }>;
}

export default async function RepositoryLayout({
  children,
  params,
}: RepositoryLayoutProps) {
  const { owner, repo } = await params;

  return (
    <Structure owner={owner} repository={repo}>
      {children}
    </Structure>
  );
}
