import { useRouter } from 'next/router';
import { FC, useEffect, useState } from 'react';
import { useSegments } from '../../hooks/useSegments';
import useTranslation from 'next-translate/useTranslation';
import { getTabs } from '../../utils/tab-helper';
import { Mode, Tab } from '../../types/Tab';
import { DEV_MODE } from '../../constants/common';
import BottomNavbar from './BottomNavbar';
import { useAppearance } from '../../hooks/useAppearance';
import LeftSidebar from './LeftSidebar';
import TopNavbar from './TopNavbar';
import ScrollTopTopButton from './ScrollTopTopButton';

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
  const { hideExperimentalOnTopNav } = useAppearance();

  const tabs = mode ? getTabs({ t, router, mode }) : [];

  const deduplicate = (arr: Tab[]) =>
    arr.filter((_, index) => index === arr.findIndex((a) => a.href === _.href));

  const filteredTabs = deduplicate(
    tabs.filter(
      (tab) => (DEV_MODE && !hideExperimentalOnTopNav) || !tab.disabled
    )
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
    <div className="flex h-screen max-h-full min-h-full w-screen min-w-full max-w-full overscroll-none">
      <LeftSidebar />
      <BottomNavbar />

      <div className="relative flex h-full w-full flex-col bg-white dark:bg-[#111113]">
        <TopNavbar
          cachedDisableTabs={cachedDisableTabs}
          defaultNoTabs={defaultNoTabs}
          disableTabs={disableTabs}
          isFavorite={isFavorite}
          onFavorite={onFavorite}
          setDisableTabs={setDisableTabs}
          segments={segments}
          tabs={filteredTabs}
        />

        <main
          id="content"
          className={`h-full overflow-auto scroll-smooth px-4 ${
            defaultNoTabs ? 'pt-24' : 'pt-[6.75rem] md:pt-32'
          } md:px-8 lg:px-16 xl:px-32`}
        >
          {children}
        </main>

        <ScrollTopTopButton prevScrollPos={prevScrollPos} />
      </div>
    </div>
  );
};

export default NestedLayout;
