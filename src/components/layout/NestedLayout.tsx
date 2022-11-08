import Link from 'next/link';
import { useRouter } from 'next/router';
import { FC } from 'react';
import Layout from './Layout';
import { useAppearance } from '../../hooks/useAppearance';

interface NestedLayoutProps {
  children: React.ReactNode;
  orgMode?: boolean;
}

const tabs = [
  {
    name: 'Overview',
    href: '/',
  },
  {
    name: 'Projects',
    href: '/projects',
  },
  {
    name: 'Members',
    href: '/members',
  },
  {
    name: 'Settings',
    href: '/settings',
  },
];

const NestedLayout: FC<NestedLayoutProps> = ({
  children,
  orgMode = true,
}: NestedLayoutProps) => {
  const {
    query: { orgId, projectId },
  } = useRouter();

  const { segments } = useAppearance();
  const rootTabs = orgMode
    ? tabs
    : tabs.filter((tab) => tab.name !== 'Projects');

  const rootPath = orgMode ? `/orgs/${orgId}` : `/projects/${projectId}`;

  return (
    <Layout>
      <nav className="absolute left-0 right-0 border-b border-zinc-800">
        <div className="px-8 lg:px-0 lg:mx-56 flex gap-4 overflow-x-auto scrollbar-none transition-all duration-300">
          {rootTabs.map((tab) => (
            <Link
              key={tab.name}
              href={`${rootPath}${tab.href}`}
              className={`pb-2 border-b-2 rounded-t-lg group ${
                segments &&
                segments.length > 0 &&
                (orgMode
                  ? segments
                      .map((segment) => segment.content)
                      .includes(tab.name)
                  : `${segments[2]?.content}` === tab.name)
                  ? 'border-zinc-300 text-zinc-300'
                  : 'border-transparent text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <div className="group-hover:bg-zinc-800 px-4 py-1 rounded-lg font-semibold">
                {tab.name}
              </div>
            </Link>
          ))}
        </div>
      </nav>
      <div className="h-16" />
      {children}
    </Layout>
  );
};

export default NestedLayout;
