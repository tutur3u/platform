import Link from 'next/link';
import { useRouter } from 'next/router';
import { FC, Fragment } from 'react';
import { useSegments } from '../../hooks/useSegments';
import { ActionIcon } from '@mantine/core';
import { StarIcon as OutlinedStarIcon } from '@heroicons/react/24/outline';
import { StarIcon } from '@heroicons/react/24/solid';
import LoadingIndicator from '../common/LoadingIndicator';
import useTranslation from 'next-translate/useTranslation';
import { getTabs } from '../../utils/tab-helper';
import { Mode } from '../../types/Tab';
import { DEV_MODE } from '../../constants/common';
import BottomNavigationBar from './BottomNavigationBar';
import { SidebarState, useAppearance } from '../../hooks/useAppearance';
import LeftSidebar from './LeftSidebar';

interface Props {
  children: React.ReactNode;
  mode?: Mode;

  isFavorite?: boolean;
  onFavorite?: () => void;

  noTabs?: boolean;
}

const NestedLayout: FC<Props> = ({
  children,
  mode,
  isFavorite = false,
  onFavorite,
  noTabs = false,
}: Props) => {
  const router = useRouter();

  const { t } = useTranslation();

  const { segments } = useSegments();
  const { sidebar } = useAppearance();

  const tabs = mode ? getTabs({ t, router, mode }) : [];

  const disableTabs = noTabs || tabs.length === 0;

  const generateSidebarWidth = (state: SidebarState) =>
    state === 'closed' ? 'w-0 md:w-16' : 'w-full md:w-64';

  const generateLeftMargin = (state: SidebarState) =>
    state === 'closed' ? 'md:ml-16' : 'md:ml-64';

  return (
    <div className="flex h-screen min-h-screen w-full bg-[#111113]">
      <LeftSidebar
        className={`transition-all duration-300 ${generateSidebarWidth(
          sidebar
        )}`}
      />

      <main
        className={`scrollbar-none fixed inset-0 flex h-full flex-col overflow-auto bg-[#111113] ${generateLeftMargin(
          sidebar
        )} transition-all duration-300`}
      >
        <nav
          className={`${
            disableTabs ? 'h-16' : 'h-25'
          } fixed z-[9999] w-full flex-none border-b border-zinc-800 bg-[#111113]/70 backdrop-blur-md`}
        >
          <div className="flex items-center gap-2 py-3">
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
              <div className="scrollbar-none mx-4 flex gap-2 overflow-x-auto rounded border border-zinc-800 bg-zinc-900 p-1 md:mx-8 lg:mx-16 xl:mx-32">
                {segments
                  .filter((_, index) =>
                    // If disableTabs is true, then we want to show all segments
                    disableTabs
                      ? true
                      : // Otherwise, don't show the last segment
                        index < segments.length - 1
                  )
                  .map((s, index) => (
                    <Fragment key={`segment-${s.content}-${s.href}`}>
                      <Link
                        href={s.href}
                        className="min-w-max rounded px-2 py-0.5 font-semibold transition hover:bg-zinc-300/10"
                      >
                        {s?.content || ''}
                      </Link>
                      {index < segments.length - (disableTabs ? 1 : 2) && (
                        <span className="cursor-default select-none text-zinc-500">
                          /
                        </span>
                      )}
                    </Fragment>
                  ))}
              </div>
            ) : (
              <LoadingIndicator className="h-4 w-4" />
            )}
          </div>
          {disableTabs || (
            <div className="scrollbar-none flex gap-4 overflow-x-auto px-4 transition-all duration-300 md:mx-8 md:px-0 lg:mx-16 xl:mx-32">
              {tabs
                .filter((tab) => DEV_MODE || !tab.disabled)
                .map((tab) => {
                  if (tab.disabled)
                    return (
                      <div
                        key={`tab-${tab.href}`}
                        className="group flex-none cursor-not-allowed rounded-t-lg border-b-2 border-transparent pb-2 text-zinc-500/80 opacity-50"
                      >
                        <div
                          className={`select-none rounded px-4 py-1 text-center font-semibold`}
                        >
                          {tab.name}
                        </div>
                      </div>
                    );

                  return (
                    <Link
                      key={`tab-${tab.href}`}
                      href={tab.href}
                      className={`group flex-none rounded-t-lg border-b-2 pb-2 ${
                        segments &&
                        segments.length > 0 &&
                        segments.slice(-1)[0].href === tab.href
                          ? 'border-zinc-300 text-zinc-300'
                          : 'border-transparent text-zinc-500 md:hover:text-zinc-300'
                      }`}
                    >
                      <div className="rounded px-4 py-1 text-center font-semibold md:group-hover:bg-zinc-800">
                        {tab.name}
                      </div>
                    </Link>
                  );
                })}
            </div>
          )}
        </nav>

        <div
          className={`${
            disableTabs ? 'pt-24' : 'pt-32'
          } h-full px-4 md:px-8 lg:px-16 xl:px-32`}
        >
          {children}
        </div>
        <BottomNavigationBar />
      </main>
    </div>
  );
};

export default NestedLayout;
