import React from 'react';

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  return (
    <>
      <div id="main-content" className="flex flex-col pt-[53px]">
        {children}
      </div>
    </>
  );
}
