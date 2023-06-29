import { StarIcon as OutlinedStarIcon } from '@heroicons/react/24/outline';
import { StarIcon } from '@heroicons/react/24/solid';
import { ActionIcon } from '@mantine/core';
import Link from 'next/link';
import { Fragment } from 'react';
import LoadingIndicator from '../common/LoadingIndicator';
import { Tab } from '../../types/Tab';
import { useAppearance } from '../../hooks/useAppearance';

interface Props {
  cachedDisableTabs?: boolean;
  disableTabs?: boolean;
  defaultNoTabs?: boolean;
  setDisableTabs?: (disableTabs: boolean) => void;
  isFavorite?: boolean;
  onFavorite?: () => void;
  segments?: { content: string; href: string }[];
  tabs: Tab[];
}

const TopNavbar = ({
  cachedDisableTabs = false,
  disableTabs = false,
  defaultNoTabs = false,
  setDisableTabs = () => {},
  isFavorite = false,
  onFavorite,
  segments,
  tabs,
}: Props) => {
  const { sidebar } = useAppearance();
  const isExpanded = sidebar === 'open';

  return (
    <nav
      id="top-navigation"
      className={`${
        disableTabs ? 'h-[3.95rem]' : 'h-25'
      } fixed left-0 right-0 top-0 w-full ${
        isExpanded ? 'md:left-64' : 'md:left-[3.8rem]'
      } z-[100] clear-both flex-none border-b border-zinc-300 bg-white/50 backdrop-blur transition-all duration-500 content-none dark:border-zinc-800 dark:bg-[#111113]/50`}
      onMouseEnter={
        defaultNoTabs || !disableTabs ? undefined : () => setDisableTabs(false)
      }
      onMouseLeave={
        defaultNoTabs || !disableTabs
          ? undefined
          : () => setDisableTabs(cachedDisableTabs)
      }
    >
      <div className="flex items-center gap-2 py-2">
        {onFavorite && (
          <ActionIcon color="yellow" onClick={onFavorite}>
            {isFavorite ? (
              <StarIcon className="h-6 w-6" />
            ) : (
              <OutlinedStarIcon className="h-6 w-6" />
            )}
          </ActionIcon>
        )}

        <div
          id="segments"
          className="scrollbar-none mx-4 flex gap-2 overflow-x-auto rounded p-1 md:mx-8 lg:mx-16 xl:mx-32"
        >
          {segments && segments.length > 0 ? (
            segments
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
                    className="min-w-max rounded border border-transparent px-2 py-0.5 font-semibold text-zinc-700 transition dark:text-zinc-300 md:hover:border-zinc-500/20 md:hover:bg-zinc-500/10 md:dark:hover:border-zinc-300/10 md:dark:hover:bg-zinc-300/10"
                  >
                    {s?.content || ''}
                  </Link>
                  {index < segments.length - (disableTabs ? 1 : 2) && (
                    <span className="cursor-default select-none text-zinc-500">
                      /
                    </span>
                  )}
                </Fragment>
              ))
          ) : (
            <div className="min-w-max rounded border border-transparent px-2 py-0.5 font-semibold transition md:hover:border-zinc-500/20 md:hover:bg-zinc-500/10 md:dark:hover:border-zinc-300/10 md:dark:hover:bg-zinc-300/10">
              <LoadingIndicator className="h-4 w-4" />
            </div>
          )}
        </div>
      </div>

      {disableTabs || (
        <div
          id="tabs"
          className="scrollbar-none flex gap-4 overflow-x-auto px-4 duration-300 md:mx-8 md:px-0 lg:mx-16 xl:mx-32"
        >
          {tabs.map((tab) => {
            if (tab.disabled)
              return (
                <div
                  key={`tab-${tab.href}`}
                  className="group flex-none cursor-not-allowed rounded-t-lg border-b-2 border-transparent pb-2 opacity-50 dark:text-zinc-500/80"
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
                    ? 'border-zinc-500 text-zinc-700 dark:border-zinc-300 dark:text-zinc-300'
                    : 'border-transparent text-zinc-400 dark:text-zinc-500 md:hover:text-zinc-700 md:dark:hover:text-zinc-300'
                }`}
              >
                <div className="rounded px-4 py-1 text-center font-semibold md:group-hover:bg-zinc-500/10 md:dark:group-hover:bg-zinc-800">
                  {tab.name}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </nav>
  );
};

export default TopNavbar;
