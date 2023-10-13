import { useRouter } from 'next/router';
import { FC } from 'react';
import useTranslation from 'next-translate/useTranslation';
import { getTabs } from '../../utils/tab-helper';
import { Mode, Tab } from '../../types/Tab';
import { DEV_MODE } from '../../constants/common';
import BottomNavbar from './BottomNavbar';
import { useAppearance } from '../../hooks/useAppearance';
import LeftSidebar from './LeftSidebar';

interface Props {
  children: React.ReactNode;
  mode?: Mode;

  isFavorite?: boolean;
  onFavorite?: () => void;

  noTabs?: boolean;
}

const NestedLayout: FC<Props> = ({ children, mode, noTabs = false }: Props) => {
  const router = useRouter();

  const { t } = useTranslation();

  const { sidebar, hideExperimentalOnTopNav } = useAppearance();

  const tabs = mode ? getTabs({ t, router, mode }) : [];

  const deduplicate = (arr: Tab[]) =>
    arr.filter((_, index) => index === arr.findIndex((a) => a.href === _.href));

  const filteredTabs = deduplicate(
    tabs.filter(
      (tab) => (DEV_MODE && !hideExperimentalOnTopNav) || !tab.disabled
    )
  );

  const defaultNoTabs = noTabs || filteredTabs.length === 0;

  return (
    <div className="flex max-h-screen min-h-full">
      <LeftSidebar />
      <BottomNavbar />

      <main
        id="content"
        className={`h-full w-full overflow-x-hidden scroll-smooth transition-all duration-500 ${
          sidebar === 'open'
            ? 'fixed overflow-y-hidden md:static md:overflow-y-auto'
            : 'overflow-y-auto'
        } ${defaultNoTabs ? 'pt-24' : 'md:pt-30 pt-28'} ${
          sidebar === 'open' ? 'md:ml-64' : 'md:ml-16'
        } px-4 pb-16 md:px-8 md:pb-8 lg:px-16 xl:px-32`}
      >
        {children}
      </main>
    </div>
  );
};

export default NestedLayout;
