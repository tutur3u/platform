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
    name: 'Boards',
    href: '/boards',
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
        <div className="flex gap-4 overflow-x-auto px-8 transition-all duration-300 scrollbar-none lg:mx-56 lg:px-0">
          {rootTabs.map((tab) => (
            <Link
              key={tab.name}
              href={`${rootPath}${tab.href}`}
              className={`group rounded-t-lg border-b-2 pb-2 ${
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
              <div className="rounded-lg px-4 py-1 font-semibold group-hover:bg-zinc-800">
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
