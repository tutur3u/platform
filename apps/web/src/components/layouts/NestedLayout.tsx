import Link from 'next/link';
import { useRouter } from 'next/router';
import { FC, Fragment } from 'react';
import { useSegments } from '../../hooks/useSegments';
import { ActionIcon } from '@mantine/core';
import { StarIcon as OutlinedStarIcon } from '@heroicons/react/24/outline';
import { StarIcon } from '@heroicons/react/24/solid';
import LoadingIndicator from '../common/LoadingIndicator';
import SidebarLayout from './SidebarLayout';
import {
  Tab,
  financeTabs,
  inventoryTabs,
  miscTabs,
  patientDetailsTabs,
  productDetailsTabs,
  teamTabs,
  workspaceTabs,
} from '../../constants/tabs';

type Mode =
  | 'workspace'
  | 'team'
  | 'misc'
  | 'inventory'
  | 'finance'
  | 'product_details'
  | 'patient_details';

interface NestedLayoutProps {
  children: React.ReactNode;
  mode?: Mode;

  isFavorite?: boolean;
  onFavorite?: () => void;

  noTabs?: boolean;
}

const NestedLayout: FC<NestedLayoutProps> = ({
  children,
  mode = 'workspace',
  isFavorite = false,
  onFavorite,
  noTabs = false,
}: NestedLayoutProps) => {
  const router = useRouter();
  const { segments } = useSegments();

  const {
    query: { wsId, teamId, productId, patientId },
  } = router;

  const enhanceHref = (tabs: Tab[]) => {
    return tabs.map((tab) => {
      if (tab.href) {
        return {
          ...tab,
          href: tab.href
            .replace('[wsId]', wsId as string)
            .replace('[teamId]', teamId as string)
            .replace('[productId]', productId as string)
            .replace('[patientId]', patientId as string)
            .replace(/\/$/, ''),
        };
      }

      return tab;
    });
  };

  const layoutTabs =
    mode === 'workspace'
      ? workspaceTabs
      : mode === 'misc'
      ? miscTabs
      : mode === 'inventory'
      ? inventoryTabs
      : mode === 'finance'
      ? financeTabs
      : mode === 'product_details'
      ? productDetailsTabs
      : mode === 'patient_details'
      ? patientDetailsTabs
      : teamTabs;

  const tabs = enhanceHref(layoutTabs);

  return (
    <SidebarLayout>
      <nav
        className={`${
          noTabs ? 'h-16' : 'h-25'
        } w-full flex-none border-b border-zinc-800`}
      >
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
                .filter((_, index) =>
                  // If noTabs is true, then we want to show all segments
                  noTabs
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
                    {index < segments.length - (noTabs ? 1 : 2) && (
                      <span className="text-zinc-500">/</span>
                    )}
                  </Fragment>
                ))}
            </div>
          ) : (
            <LoadingIndicator className="h-4 w-4" />
          )}
        </div>
        {noTabs || (
          <div className="scrollbar-none flex gap-4 overflow-x-auto px-4 transition-all duration-300 md:mx-8 md:px-0 lg:mx-16 xl:mx-32">
            {tabs.map((tab) => (
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
            ))}
          </div>
        )}
      </nav>
      <div
        className={`${
          noTabs ? 'h-[calc(100vh-4rem)]' : 'h-[calc(100vh-13rem)]'
        } px-4 py-8 md:px-8 lg:px-16 xl:px-32`}
      >
        {children}
      </div>
    </SidebarLayout>
  );
};

export default NestedLayout;
