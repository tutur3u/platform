import { Translate } from 'next-translate';
import { NextRouter } from 'next/router';
import { Mode, NavTabs, Tab } from '../types/Tab';
import { getNavTabs } from '../constants/tabs';

const enhanceHref = ({ router, tabs }: { router: NextRouter; tabs: Tab[] }) => {
  const { wsId, teamId, productId, patientId, userId } = router.query;

  return tabs.map((tab) => {
    if (tab.href) {
      const newHref = tab.href
        .replace('[wsId]', wsId as string)
        .replace('[teamId]', teamId as string)
        .replace('[productId]', productId as string)
        .replace('[patientId]', patientId as string)
        .replace('[userId]', userId as string);

      return {
        ...tab,
        href: newHref.replace(/\/$/, ''),
      };
    }

    return tab;
  });
};

const getLocalizedTabs = ({ tabs, namespace }: NavTabs, t: Translate) => {
  return tabs.map((tab) => ({
    ...tab,
    name: t(`${namespace}:${tab.name}`),
  }));
};

export const getTabs = ({
  t,
  router,
  mode,
}: {
  t: Translate;
  router: NextRouter;
  mode: Mode;
}) => {
  const navTabs = getNavTabs(mode);
  const tabs = getLocalizedTabs(navTabs, t);

  return enhanceHref({ router, tabs });
};
