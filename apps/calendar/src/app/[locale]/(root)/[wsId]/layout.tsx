import React from 'react';

interface LayoutProps {
  children: React.ReactNode;
}

export default function WorkspaceLayout({ children }: LayoutProps) {
  return <div className="flex flex-col">{children}</div>;
}
