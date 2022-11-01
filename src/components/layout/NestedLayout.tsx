import Link from 'next/link';
import { useRouter } from 'next/router';
import { FC } from 'react';
import Layout from './Layout';
import { useAppearance } from '../../hooks/useAppearance';

interface NestedLayoutProps {
  children: React.ReactNode;
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
}: NestedLayoutProps) => {
  const {
    query: { orgId },
  } = useRouter();

  const { segments } = useAppearance();

  return (
    <Layout>
      <nav className="absolute left-0 right-0 border-b border-zinc-800">
        <div className="mx-56 flex gap-4">
          {tabs.map((tab) => (
            <Link
              key={tab.name}
              href={`/orgs/${orgId}${tab.href}`}
              className={`pb-2 border-b-2 rounded-t-lg group ${
                segments.includes(tab.name)
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
