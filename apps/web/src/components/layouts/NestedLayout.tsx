import Link from 'next/link';
import { useRouter } from 'next/router';
import { FC, Fragment, useEffect, useState } from 'react';
import { useSegments } from '../../hooks/useSegments';
import { ActionIcon, Button } from '@mantine/core';
import { StarIcon as OutlinedStarIcon } from '@heroicons/react/24/outline';
import { ArrowUpCircleIcon, StarIcon } from '@heroicons/react/24/solid';
import LoadingIndicator from '../common/LoadingIndicator';
import useTranslation from 'next-translate/useTranslation';
import { getTabs } from '../../utils/tab-helper';
import { Mode, Tab } from '../../types/Tab';
import { DEV_MODE } from '../../constants/common';
import BottomNavigationBar from './BottomNavigationBar';
import { useAppearance } from '../../hooks/useAppearance';
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
  const { hideExperimental } = useAppearance();

  const tabs = mode ? getTabs({ t, router, mode }) : [];

  const deduplicate = (arr: Tab[]) =>
    arr.filter((_, index) => index === arr.findIndex((a) => a.href === _.href));

  const filteredTabs = deduplicate(
    tabs.filter((tab) => (DEV_MODE && !hideExperimental) || !tab.disabled)
  );

  const defaultNoTabs = noTabs || filteredTabs.length === 0;

  const [disableTabs, setDisableTabs] = useState(defaultNoTabs);
  const [cachedDisableTabs, setCachedDisableTabs] = useState(defaultNoTabs);

  const [prevScrollPos, setPrevScrollPos] = useState(0);

  useEffect(() => {
    if (defaultNoTabs) {
      setDisableTabs(true);
      setCachedDisableTabs(true);
      return;
    } else {
      setDisableTabs(false);
      setCachedDisableTabs(false);
    }

    const content = document.getElementById('content');
    if (!content) return;

    const handleScroll = () => {
      const pos = content.scrollTop;
      setPrevScrollPos(pos);

      const disable = pos > 0;

      setDisableTabs(disable);
      setCachedDisableTabs(disable);
    };

    content.addEventListener('scroll', handleScroll);
    return () => content.removeEventListener('scroll', handleScroll);
  }, [defaultNoTabs]);

  return (
    <div className="relative flex h-screen min-h-full w-screen min-w-full">
      <LeftSidebar />

      <main className={`relative flex h-full w-full flex-col bg-[#111113]`}>
        <nav
          id="top-navigation"
          className={`${
            disableTabs ? 'h-[3.8rem]' : 'h-25'
          } absolute inset-x-0 top-0 z-[100] flex-none border-b border-zinc-800 bg-[#111113]/50 backdrop-blur transition-all duration-300`}
          onMouseEnter={
            defaultNoTabs || !disableTabs
              ? undefined
              : () => setDisableTabs(false)
          }
          onMouseLeave={
            defaultNoTabs || !disableTabs
              ? undefined
              : () => setDisableTabs(cachedDisableTabs)
          }
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
              <div
                id="segments"
                className="scrollbar-none mx-4 flex gap-2 overflow-x-auto rounded p-1 md:mx-8 lg:mx-16 xl:mx-32"
              >
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
                        className="min-w-max rounded border border-transparent px-2 py-0.5 font-semibold transition md:hover:border-zinc-300/10 md:hover:bg-zinc-300/10"
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
            <div
              id="tabs"
              className="scrollbar-none flex gap-4 overflow-x-auto px-4 duration-300 md:mx-8 md:px-0 lg:mx-16 xl:mx-32"
            >
              {filteredTabs.map((tab) => {
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
          id="content"
          className={`h-full overflow-auto scroll-smooth px-4 ${
            defaultNoTabs ? 'pt-24' : 'pt-32'
          } md:px-8 lg:px-16 xl:px-32`}
        >
          {children}
        </div>

        <Button
          className={`fixed bottom-16 right-4 z-50 rounded-full border border-blue-300/20 bg-[#2b3542] md:bottom-4 md:right-8 ${
            prevScrollPos <= 100 ? 'hidden' : ''
          }`}
          size="md"
          variant="subtle"
          onClick={() => {
            document?.getElementById('content')?.scrollTo(0, 0);
          }}
        >
          <ArrowUpCircleIcon className="h-6 w-6" />
        </Button>

        <BottomNavigationBar />
      </main>
    </div>
  );
};

export default NestedLayout;
