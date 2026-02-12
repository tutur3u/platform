import type { ReactNode } from 'react';

interface LayoutProps {
  children: ReactNode;
}

export default async function AuthLayout({ children }: LayoutProps) {
  return (
    <div className="h-screen max-h-screen min-h-screen overflow-y-auto">
      {children}
    </div>
  );
}
