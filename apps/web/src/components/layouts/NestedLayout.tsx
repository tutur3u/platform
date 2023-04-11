import Link from 'next/link';
import { useRouter } from 'next/router';
import { FC, Fragment } from 'react';
import { useSegments } from '../../hooks/useSegments';
import { ActionIcon } from '@mantine/core';
import { StarIcon as OutlinedStarIcon } from '@heroicons/react/24/outline';
import { StarIcon } from '@heroicons/react/24/solid';
import LoadingIndicator from '../common/LoadingIndicator';
import SidebarLayout from './SidebarLayout';
import useTranslation from 'next-translate/useTranslation';
import { getTabs } from '../../utils/tab-helper';
import { Mode } from '../../types/Tab';
import { DEV_MODE } from '../../constants/common';

interface NestedLayoutProps {
  children: React.ReactNode;
  mode?: Mode;

  isFavorite?: boolean;
  onFavorite?: () => void;

  noTabs?: boolean;
}

const NestedLayout: FC<NestedLayoutProps> = ({
  children,
  mode,
  isFavorite = false,
  onFavorite,
  noTabs = false,
}: NestedLayoutProps) => {
  const router = useRouter();

  const { t } = useTranslation();
  const { segments } = useSegments();

  const tabs = mode ? getTabs({ t, router, mode }) : [];

  const disableTabs = noTabs || tabs.length === 0;

  return (
    <SidebarLayout>
      <nav
        className={`${
          disableTabs ? 'h-16' : 'h-25'
        } fixed z-10 w-full flex-none border-b border-zinc-800 bg-[#111113]/70 backdrop-blur-md`}
      >
        <div className="flex items-center gap-2 py-4">
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
            <div className="scrollbar-none flex gap-2 overflow-x-auto px-4 md:px-8 lg:px-16 xl:px-32">
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
                      <span className="text-zinc-500">/</span>
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
    </SidebarLayout>
  );
};

export default NestedLayout;
