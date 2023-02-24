import Link from 'next/link';
import { useRouter } from 'next/router';
import { FC, Fragment } from 'react';
import { useAppearance } from '../../hooks/useAppearance';
import { ActionIcon } from '@mantine/core';
import { StarIcon as OutlinedStarIcon } from '@heroicons/react/24/outline';
import { StarIcon } from '@heroicons/react/24/solid';
import LoadingIndicator from '../common/LoadingIndicator';
import SidebarLayout from './SidebarLayout';

type Mode = 'workspace' | 'project' | 'document';

interface NestedLayoutProps {
  children: React.ReactNode;
  mode?: Mode;

  isFavorite?: boolean;
  onFavorite?: () => void;
}

const workspaceTabs = [
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

const projectTabs = [
  {
    name: 'Overview',
    href: '/',
  },
  {
    name: 'Calendar',
    href: '/calendar',
  },
  {
    name: 'Boards',
    href: '/boards',
  },
  {
    name: 'Documents',
    href: '/documents',
  },
  {
    name: 'Finance',
    href: '/finance',
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
  mode = 'workspace',
  isFavorite = false,
  onFavorite,
}: NestedLayoutProps) => {
  const router = useRouter();
  const { segments } = useAppearance();

  const {
    query: { wsId, projectId },
  } = router;

  const tabs =
    mode === 'document'
      ? []
      : mode === 'workspace'
      ? workspaceTabs
      : projectTabs;
  const path =
    mode === 'workspace' ? `/workspaces/${wsId}` : `/projects/${projectId}`;

  return (
    <SidebarLayout>
      <nav className="w-full border-b border-zinc-800">
        <div className="mx-4 flex items-center gap-2 py-4 md:mx-8 lg:mx-16 xl:mx-32">
          {onFavorite && (
            <ActionIcon color="yellow" onClick={onFavorite}>
              {isFavorite ? (
                <StarIcon className="h-6 w-6" />
              ) : (
                <OutlinedStarIcon className="h-6 w-6" />
              )}
            </ActionIcon>
          )}

          {segments && segments.length > 0 ? (
            <div className="scrollbar-none flex gap-x-2 overflow-x-auto">
              {segments
                // remove last segment
                .slice(
                  0,
                  mode === 'document' ? segments.length : segments.length - 1
                )
                .map((s, index) => (
                  <Fragment key={`segment-${s.href}`}>
                    <Link
                      href={s.href}
                      className="min-w-max rounded px-2 py-0.5 font-semibold transition hover:bg-zinc-300/10"
                    >
                      {s?.content || ''}
                    </Link>
                    {index <
                      segments.length - (mode === 'document' ? 1 : 2) && (
                      <span className="text-zinc-500">/</span>
                    )}
                  </Fragment>
                ))}
            </div>
          ) : (
            <LoadingIndicator className="h-4 w-4" />
          )}
        </div>
        <div className="scrollbar-none flex gap-4 overflow-x-auto px-4 transition-all duration-300 md:mx-8 md:px-0 lg:mx-16 xl:mx-32">
          {tabs.map((tab) => (
            <Link
              key={`tab-${tab.href}`}
              href={`${path}${tab.href}`}
              className={`group rounded-t-lg border-b-2 pb-2 ${
                segments &&
                segments.length > 0 &&
                (mode === 'workspace'
                  ? segments
                      .map((segment) => segment.content)
                      .includes(tab.name)
                  : segments[3]?.content === tab.name)
                  ? 'border-zinc-300 text-zinc-300'
                  : 'border-transparent text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <div className="rounded px-4 py-1 font-semibold group-hover:bg-zinc-800">
                {tab.name}
              </div>
            </Link>
          ))}
        </div>
      </nav>
      <div className="m-4 md:mx-8 lg:mx-16 xl:mx-32">{children}</div>
    </SidebarLayout>
  );
};

export default NestedLayout;
