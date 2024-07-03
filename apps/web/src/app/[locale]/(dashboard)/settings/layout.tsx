import React from 'react';

interface LayoutProps {
  children: React.ReactNode;
}

export default async function Layout({ children }: LayoutProps) {
  // const navLinks: NavLink[] = [
  //   {
  //     name: 'Account',
  //     href: '/settings/account',
  //   },
  //   {
  //     name: 'Appearance',
  //     href: '/settings/appearance',
  //     disabled: true,
  //   },
  //   {
  //     name: 'Workspaces',
  //     href: '/settings/workspaces',
  //     disabled: true,
  //   },
  //   {
  //     name: 'Activities',
  //     href: '/settings/activities',
  //     disabled: true,
  //   },
  // ];

  return (
    <>
      <div className="p-4 pb-2 font-semibold md:px-8 lg:px-16 xl:px-32">
        {/* <div className="flex gap-1 overflow-x-auto">
          <Navigation navLinks={navLinks} />
        </div> */}
      </div>

      {/* <Separator /> */}

      <div className="flex items-center justify-center p-4 md:px-8 lg:px-16 xl:px-32">
        {children}
      </div>
    </>
  );
}
